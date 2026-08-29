import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { resolveConfig } from "../../src/domains/debugging/lib/config.js";
import { isOfficialWriterCommand, loadLedger, scanLedgers } from "../../src/domains/debugging/lib/ledger.js";
import { activateBug, affectBugs, claimHypothesis, claimRootCause, closeLedger, initLedger, pauseLedger, resumeLedger, statusLedger } from "../../src/domains/debugging/lib/writer.js";
import {
  bindAfterWriter,
  bindWorkOrderAfterMutation,
  completionFindings,
  preMutationDecision,
  recordReceipt,
  refreshBoundWorkOrder,
} from "../../src/domains/debugging/lib/workflow.js";
import { extractWorkOrder, validateWorkOrder } from "../../src/domains/debugging/lib/work-order.js";

const HOOK_SRC = fileURLToPath(new URL("./run-hook.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const CLI_SRC = fileURLToPath(new URL("../../src/entries/cli/harness.ts", import.meta.url));

function bug(id, status = "queued") {
  return {
    id,
    summary: `${id} fails`,
    goal: "fix",
    status,
    priority: "high",
    dependsOn: [],
    duplicateOf: null,
    rootCauseGroup: null,
    symptom: {
      expected: "command succeeds",
      actual: "command fails",
      reproduction: `node --test ${id}.test.mjs`,
      environment: "local fixture",
    },
    hypotheses: [
      { id: "H1", statement: "input parser regressed", falsifier: "parser fixture succeeds", status: "open", evidenceRefs: [] },
      { id: "H2", statement: "storage lookup regressed", falsifier: "lookup fixture succeeds", status: "open", evidenceRefs: [] },
    ],
    rootCause: { status: "unknown", statement: "", causalChain: [], evidenceRefs: [] },
    fix: { status: "not-started", firstRevision: null, affectedBugIds: [], summary: "" },
    verification: { originalReproduction: null, regression: [], debugCleanup: null },
    attempts: [],
    residualRisks: [],
  };
}

function order(overrides = {}) {
  return {
    schema: "debug-work-order/v1",
    id: "DWO-20260808-two-bugs",
    status: "open",
    run: { epoch: 1, state: "active", mode: "investigate-and-fix" },
    activeBugId: "BUG-001",
    bugs: [bug("BUG-001", "investigating"), bug("BUG-002")],
    resume: { nextBugId: "BUG-001", nextAction: "reproduce", recoveryCommands: [] },
    ...overrides,
  };
}

function writeMarkdownOrder(path, value) {
  writeFileSync(path, `# Debug Work Order\n\n\`\`\`json debug-work-order/v1\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "debug-ledger-contract-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, ".debug-workflow"), { recursive: true });
  const path = join(root, ".debug-workflow", "20260808-two-bugs.md");
  writeMarkdownOrder(path, order());
  return { root, path };
}

function runHook(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [TSX, HOOK_SRC, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function runCli(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [TSX, CLI_SRC, "debug", ...args, "--cwd", cwd], {
      env: { ...process.env, PLUGIN_ROOT: fileURLToPath(new URL("../..", import.meta.url)) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test("Stop on an open/active bound session does not deny", async () => {
  const fx = fixture();
  assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "open-stop", touchedPaths: [fx.path] }).kind, "bound");
  const stopped = await runHook("stop", {
    cwd: fx.root,
    session_id: "open-stop",
    last_assistant_message: "Investigating the failing reproduction next.",
  });
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.doesNotMatch(stopped.stdout, /"decision":"block"/u);
  assert.doesNotMatch(stopped.stdout, /remains active/u);
});

test("pre-mutation allows a production write after only a failing baseline receipt", () => {
  const fx = fixture();
  bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "baseline-only", touchedPaths: [fx.path] });
  const codePath = join(fx.root, "src.js");
  assert.match(preMutationDecision({ cwd: fx.root, sessionId: "baseline-only", paths: [codePath] }).reason, /exact reproduction command verbatim/u);

  recordReceipt({ cwd: fx.root, sessionId: "baseline-only", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
  const ready = preMutationDecision({ cwd: fx.root, sessionId: "baseline-only", paths: [codePath] });
  assert.equal(ready.action, "allow", ready.reason);
});

test("pre-mutation still denies after three failed post-mutation reproductions", () => {
  const fx = fixture();
  bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "freeze", touchedPaths: [fx.path] });
  recordReceipt({ cwd: fx.root, sessionId: "freeze", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
  recordReceipt({ cwd: fx.root, sessionId: "freeze", kind: "mutation", paths: [join(fx.root, "src.js")], outcome: "success" });
  for (let index = 0; index < 3; index += 1) {
    recordReceipt({ cwd: fx.root, sessionId: "freeze", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
  }
  const frozen = preMutationDecision({ cwd: fx.root, sessionId: "freeze", paths: [join(fx.root, "src.js")] });
  assert.equal(frozen.action, "block");
  assert.match(frozen.reason, /failed fix attempts/u);
});

test("completion accepts and rejects from hook receipts without snapshot verification objects", () => {
  const closed = order({
    status: "closed",
    run: { epoch: 1, state: "closed", mode: "investigate-and-fix" },
    activeBugId: null,
  });
  closed.bugs[0].status = "investigating";
  closed.bugs[0].verification = { originalReproduction: null, regression: [], debugCleanup: null };
  closed.bugs[1].status = "deferred";
  const receipts = [
    { id: "R-2", bugId: "BUG-001", kind: "reproduction", outcome: "failure", mutationSeq: 0 },
    { id: "R-3", bugId: "BUG-001", kind: "mutation", outcome: "success", mutationSeq: 3 },
    { id: "R-4", bugId: "BUG-001", kind: "reproduction", outcome: "success", mutationSeq: 3 },
    { id: "R-5", bugId: "BUG-001", kind: "verification", outcome: "success", mutationSeq: 3 },
    { id: "R-6", bugId: "BUG-001", kind: "command", outcome: "success", mutationSeq: 3 },
  ];
  const accepted = completionFindings({ kind: "inactive", workOrder: closed, state: { receipts, mutationSeq: 3 } });
  assert.deepEqual(accepted, []);

  const missing = receipts.filter((receipt) => receipt.id !== "R-4");
  const rejected = completionFindings({ kind: "inactive", workOrder: closed, state: { receipts: missing, mutationSeq: 3 } });
  assert.match(rejected.join("\n"), /original reproduction/u);
});

test("markdown work-order fixtures still load", () => {
  const fx = fixture();
  const loaded = loadLedger(fx.path, resolveConfig(null));
  assert.equal(loaded.valid, true, (loaded.findings ?? []).join("; "));
  assert.equal(loaded.store, "markdown");
  assert.equal(loaded.workOrder.id, "DWO-20260808-two-bugs");
  const extracted = extractWorkOrder(readFileSync(fx.path, "utf8"));
  assert.equal(extracted.ok, true);
  assert.equal(validateWorkOrder(extracted.value, resolveConfig(null)).valid, true);
});

test("writer creates intent plus append-only events and fold/status stay consistent", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-writer-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "login",
    summary: "login returns 500",
    expected: "login succeeds",
    actual: "HTTP 500",
    reproduction: "node --test test/login.test.mjs",
    environment: "local",
  });
  assert.equal(created.ok, true, created.error);
  assert.match(created.id, /^DWO-/u);
  assert.equal(existsSync(join(created.path, "intent.json")), true);
  assert.equal(existsSync(join(created.path, "events.jsonl")), true);
  const events = readFileSync(join(created.path, "events.jsonl"), "utf8").trim().split("\n");
  assert.ok(events.some((line) => JSON.parse(line).t === "opened"));
  const loaded = loadLedger(created.path, resolveConfig(null));
  assert.equal(loaded.valid, true, (loaded.findings ?? []).join("; "));
  assert.equal(loaded.store, "events");
  assert.equal(loaded.workOrder.status, "open");
  assert.equal(loaded.workOrder.activeBugId, "BUG-001");

  const paused = pauseLedger({ cwd: root, id: created.id, nextAction: "collect a local reproduction" });
  assert.equal(paused.ok, true, paused.error);
  const first = statusLedger({ cwd: root, id: created.id });
  const second = statusLedger({ cwd: root, id: created.id });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.workOrder.status, "paused");
  assert.deepEqual(first.workOrder.status, second.workOrder.status);
  assert.deepEqual(first.workOrder.resume.nextAction, "collect a local reproduction");
});

test("direct file-tool writes to a live ledger are denied", async () => {
  const root = mkdtempSync(join(tmpdir(), "debug-deny-write-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "deny",
    summary: "denied mutation",
    expected: "ok",
    actual: "fail",
    reproduction: "node --test test/deny.test.mjs",
    environment: "local",
  });
  bindWorkOrderAfterMutation({ cwd: root, sessionId: "deny-write", touchedPaths: [join(created.path, "intent.json")] });
  const denied = await runHook("pre", {
    cwd: root,
    session_id: "deny-write",
    tool_name: "Write",
    tool_input: { file_path: join(created.path, "intent.json"), content: "{}" },
  });
  assert.match(denied.stdout, /"permissionDecision":"deny"/u);
  assert.match(denied.stdout, /ledger/u);
});

test("hook binds a $DWG CLI invocation from printed JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-alias-bind-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "alias",
    summary: "alias bind",
    expected: "ok",
    actual: "fail",
    reproduction: "node --test test/alias.test.mjs",
    environment: "local",
  });
  const bound = bindAfterWriter({
    cwd: root,
    sessionId: "alias-bind",
    command: "node \"$DWG\" init --cwd \"$PWD\" --slug alias --summary alias",
    stdout: JSON.stringify(created),
  });
  assert.equal(bound.kind, "bound", JSON.stringify(bound.findings ?? []));
  assert.equal(bound.workOrder.id, created.id);
});

test("writer resume with the same id and a higher epoch rebinds the session", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-resume-rebind-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "resume-rebind",
    summary: "resume after close",
    expected: "ok",
    actual: "fail",
    reproduction: "node --test test/resume.test.mjs",
    environment: "local",
  });
  const first = bindAfterWriter({
    cwd: root,
    sessionId: "resume-session",
    command: `node ${CLI_SRC} debug init --cwd ${root} --slug resume-rebind`,
    stdout: JSON.stringify(created),
  });
  assert.equal(first.kind, "bound", JSON.stringify(first.findings ?? []));
  assert.equal(first.state.epoch, 1);

  const closed = closeLedger({ cwd: root, id: created.id });
  assert.equal(closed.ok, true, closed.error);
  bindAfterWriter({
    cwd: root,
    sessionId: "resume-session",
    command: `node ${CLI_SRC} debug close --cwd ${root} --id ${created.id}`,
    stdout: JSON.stringify(closed),
  });
  const afterClose = refreshBoundWorkOrder({ cwd: root, sessionId: "resume-session" });
  assert.equal(afterClose.kind, "inactive");
  assert.equal(recordReceipt({
    cwd: root,
    sessionId: "resume-session",
    kind: "command",
    command: "node --test test/resume.test.mjs",
    outcome: "failure",
  }).kind, "inactive");

  const resumed = resumeLedger({ cwd: root, id: created.id, bugId: "BUG-001" });
  assert.equal(resumed.ok, true, resumed.error);
  assert.equal(resumed.workOrder.run.epoch, 2);
  assert.equal(resumed.workOrder.status, "open");

  const rebound = bindAfterWriter({
    cwd: root,
    sessionId: "resume-session",
    command: `node ${CLI_SRC} debug resume --cwd ${root} --id ${created.id} --bug BUG-001`,
    stdout: JSON.stringify(resumed),
  });
  assert.equal(rebound.kind, "bound", JSON.stringify(rebound.findings ?? []));
  assert.equal(rebound.state.invalid, false);
  assert.equal(rebound.state.epoch, 2);
  assert.equal(rebound.state.workOrderId, created.id);
  assert.equal(rebound.workOrder.run.epoch, 2);

  const live = refreshBoundWorkOrder({ cwd: root, sessionId: "resume-session" });
  assert.equal(live.kind, "active", JSON.stringify(live.findings ?? []));
  const receipt = recordReceipt({
    cwd: root,
    sessionId: "resume-session",
    kind: "command",
    command: "node --test test/resume.test.mjs",
    outcome: "failure",
  });
  assert.equal(receipt.kind, "recorded", JSON.stringify(receipt.findings ?? []));
  assert.equal(receipt.receipt.bugId, "BUG-001");
});

test("official writer command is recognized and a claim event is visible", () => {
  assert.equal(isOfficialWriterCommand("node /plugins/engineering-workflow/dist/cli/harness.mjs debug init --slug login"), true);
  assert.equal(isOfficialWriterCommand("node /plugins/software-debugging/dist/cli/debug-workflow.mjs init --slug login"), false);
  assert.equal(isOfficialWriterCommand("node \"$DWG\" init --cwd \"$PWD\" --slug login"), false);
  assert.equal(isOfficialWriterCommand("python3 -c \"open('.debug-workflow/x/intent.json','w').write('x')\""), false);
  const root = mkdtempSync(join(tmpdir(), "debug-claim-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "claim",
    summary: "claim event",
    expected: "ok",
    actual: "fail",
    reproduction: "node --test test/claim.test.mjs",
    environment: "local",
  });
  activateBug({ cwd: root, id: created.id, bugId: "BUG-001" });
  affectBugs({ cwd: root, id: created.id, affectedBugIds: ["BUG-001"] });
  const lines = readFileSync(join(created.path, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(lines.some((event) => event.t === "activate" && event.bugId === "BUG-001"));
  assert.ok(lines.some((event) => event.t === "affect"));
});

test("writer help commands do not activate or refresh a work-order binding", () => {
  for (const flag of ["--help", "-h"]) {
    const result = bindAfterWriter({
      cwd: process.cwd(),
      sessionId: `help-session-${flag}`,
      command: `node /plugins/engineering-workflow/dist/cli/harness.mjs debug claim ${flag}`,
      stdout: "Usage: harness debug claim ...\n",
    });

    assert.equal(result.kind, "idle", flag);
  }
});

test("closing a completed fix folds the active bug as resolved and the fix as applied", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-close-state-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "close-state",
    summary: "close state",
    userOutcome: "the closed ledger reports the completed fix",
    expected: "the bug is resolved",
    actual: "the bug is deferred",
    reproduction: "node --test test/close-state.test.mjs",
    acceptance: "node --test test/close-state-acceptance.test.mjs",
    environment: "local",
  });

  const closed = closeLedger({ cwd: root, id: created.id });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(closed.workOrder.status, "closed");
  assert.equal(closed.workOrder.bugs[0].status, "resolved");
  assert.equal(closed.workOrder.bugs[0].fix.status, "applied");
});

test("claim writers reject missing evidence identifiers instead of appending undefined fields", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-claim-validation-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "claim-validation",
    summary: "claim validation",
    userOutcome: "invalid claims are rejected",
    expected: "no event is appended",
    actual: "undefined claim fields are appended",
    reproduction: "node --test test/claim-validation.test.mjs",
    acceptance: "node --test test/claim-validation-acceptance.test.mjs",
    environment: "local",
  });
  const before = readFileSync(join(created.path, "events.jsonl"), "utf8");

  const hypothesis = claimHypothesis({ cwd: root, id: created.id });
  const rootCause = claimRootCause({ cwd: root, id: created.id, statement: "parser accepts missing evidence" });

  assert.equal(hypothesis.ok, false);
  assert.match(hypothesis.error ?? "", /bugId, hypothesisId, status, and receiptId are required/u);
  assert.equal(rootCause.ok, false);
  assert.match(rootCause.error ?? "", /bugId, statement, causalChain, and receiptId are required/u);
  assert.equal(readFileSync(join(created.path, "events.jsonl"), "utf8"), before);
});

test("CLI init then pause then status is stable across two launches", async () => {
  const root = mkdtempSync(join(tmpdir(), "debug-cli-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const opened = await runCli([
    "init",
    "--slug", "cli-login",
    "--summary", "login fails",
    "--user-outcome", "login succeeds through the public entry point",
    "--expected", "ok",
    "--actual", "500",
    "--repro", "node --test test/login.test.mjs",
    "--acceptance", "node --test test/login.acceptance.test.mjs",
    "--environment", "local",
  ], root);
  assert.equal(opened.code, 0, opened.stderr);
  const created = JSON.parse(opened.stdout.trim().split("\n").at(-1));
  assert.equal(created.ok, true);
  assert.equal(existsSync(join(root, ".debug-workflow", "cli-login", "events.jsonl")), true);

  const paused = await runCli(["pause", "--id", created.id, "--next", "rerun the exact reproduction"], root);
  assert.equal(paused.code, 0, paused.stderr);
  const first = await runCli(["status", "--id", created.id], root);
  const second = await runCli(["status", "--id", created.id], root);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const firstStatus = JSON.parse(first.stdout.trim().split("\n").at(-1));
  const secondStatus = JSON.parse(second.stdout.trim().split("\n").at(-1));
  assert.equal(firstStatus.ok, true);
  assert.equal(firstStatus.workOrder.status, "paused");
  assert.deepEqual(firstStatus.workOrder.status, secondStatus.workOrder.status);
});

test("CLI requires a user-visible outcome and acceptance command for fix work orders", async () => {
  const root = mkdtempSync(join(tmpdir(), "debug-cli-acceptance-"));
  execFileSync("git", ["init", "-q"], { cwd: root });

  const opened = await runCli([
    "init",
    "--slug", "missing-acceptance",
    "--summary", "proxy verification is insufficient",
    "--expected", "ok",
    "--actual", "proxy check passes",
    "--repro", "node --test test/proxy.test.mjs",
    "--environment", "local",
  ], root);

  assert.equal(opened.code, 1, opened.stdout);
  assert.match(opened.stdout, /userOutcome and acceptance are required/u);
  assert.equal(existsSync(join(root, ".debug-workflow", "missing-acceptance", "intent.json")), false);
});

test("scan reports folded resumable ledgers without binding", async () => {
  const root = mkdtempSync(join(tmpdir(), "debug-scan-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  initLedger({
    cwd: root,
    slug: "scan",
    summary: "scan me",
    expected: "ok",
    actual: "fail",
    reproduction: "node --test test/scan.test.mjs",
    environment: "local",
  });
  const found = scanLedgers(root, resolveConfig(null));
  assert.ok(found.some((item) => item.workOrder?.id?.startsWith("DWO-")));
  const session = await runHook("session", { cwd: root, session_id: "scan-session" });
  assert.match(session.stdout, /none was activated/u);
  const pre = await runHook("pre", {
    cwd: root,
    session_id: "scan-session",
    tool_name: "Write",
    tool_input: { file_path: join(root, "src.js"), content: "export default 1\n" },
  });
  assert.equal(pre.stdout, "");
});

test("close still fails when hook-observed completion receipts are missing", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-close-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const created = initLedger({
    cwd: root,
    slug: "close-miss",
    summary: "needs receipts",
    expected: "ok",
    actual: "fail",
    reproduction: "node --test test/close.test.mjs",
    environment: "local",
  });
  bindWorkOrderAfterMutation({ cwd: root, sessionId: "close-miss", touchedPaths: [join(created.path, "intent.json")] });
  closeLedger({ cwd: root, id: created.id });
  const live = { kind: "inactive", workOrder: statusLedger({ cwd: root, id: created.id }).workOrder, state: { receipts: [], mutationSeq: 0 } };
  // no mutation: diagnose-only/unfixed bugs may close without receipts
  const withMutation = [
    { id: "R-2", bugId: "BUG-001", kind: "reproduction", outcome: "failure", mutationSeq: 0 },
    { id: "R-3", bugId: "BUG-001", kind: "mutation", outcome: "success", mutationSeq: 3 },
  ];
  const findings = completionFindings({ kind: "inactive", workOrder: live.workOrder, state: { receipts: withMutation, mutationSeq: 3 } });
  assert.match(findings.join("\n"), /reproduction|regression|cleanup/u);
});

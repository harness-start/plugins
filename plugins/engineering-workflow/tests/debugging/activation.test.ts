import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { inferOutcome } from "../../src/domains/debugging/lib/hook-io.js";
import { bindWorkOrderAfterMutation } from "../../src/domains/debugging/lib/workflow.js";
import { initLedger, pauseLedger } from "../../src/domains/debugging/lib/writer.js";

const HOOK_SRC = fileURLToPath(new URL("./run-hook.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const WRITER = fileURLToPath(new URL("../../src/entries/cli/harness.ts", import.meta.url));
const CODEX_HOOKS = fileURLToPath(new URL("../../hooks/codex.json", import.meta.url));

function workOrder() {
  return {
    schema: "debug-work-order/v1",
    id: "DWO-20260808-login",
    status: "open",
    run: { epoch: 1, state: "active", mode: "investigate-and-fix" },
    activeBugId: "BUG-001",
    bugs: [{
      id: "BUG-001",
      summary: "login returns 500",
      goal: "fix",
      status: "investigating",
      priority: "high",
      dependsOn: [],
      duplicateOf: null,
      rootCauseGroup: null,
      symptom: {
        expected: "login succeeds",
        actual: "HTTP 500",
        reproduction: "node --test test/login.test.mjs",
        environment: "local",
      },
      hypotheses: [
        { id: "H1", statement: "token parsing regressed", falsifier: "parser accepts fixture", status: "open", evidenceRefs: [] },
        { id: "H2", statement: "database lookup fails", falsifier: "lookup succeeds", status: "open", evidenceRefs: [] },
      ],
      rootCause: { status: "unknown", statement: "", causalChain: [], evidenceRefs: [] },
      fix: { status: "not-started", firstRevision: null, affectedBugIds: [], summary: "" },
      verification: { originalReproduction: null, regression: [], debugCleanup: null },
      attempts: [],
      residualRisks: [],
    }],
    resume: { nextBugId: "BUG-001", nextAction: "reproduce failure", recoveryCommands: [] },
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "debug-workflow-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, ".debug-workflow"), { recursive: true });
  return root;
}

function runHook(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [TSX, HOOK_SRC, mode], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function openLedger(root, slug = "login") {
  return initLedger({
    cwd: root,
    slug,
    summary: "login returns 500",
    expected: "login succeeds",
    actual: "HTTP 500",
    reproduction: "node --test test/login.test.mjs",
    environment: "local",
  });
}

function writerEvent(root, created, sessionId, extra = {}) {
  const command = `node ${WRITER} debug init --cwd ${root} --slug ${created.slug || "login"} --summary login`;
  return {
    cwd: root,
    session_id: sessionId,
    tool_name: "Bash",
    tool_input: { command },
    tool_response: { exit_code: 0, stdout: JSON.stringify(created) },
    ...extra,
  };
}

function sessionState(root) {
  const sessions = join(root, ".debug-workflow", ".state", "sessions");
  const stateFile = readdirSync(sessions).find((name) => name.endsWith(".json"));
  assert.ok(stateFile);
  return JSON.parse(readFileSync(join(sessions, stateFile), "utf8"));
}

test("outcome inference fails closed when Codex omits an exit code", () => {
  assert.equal(inferOutcome({ tool_response: "TAP version 13\n# pass 0\n# fail 1\n" }), "failure");
  assert.equal(inferOutcome({ tool_response: "TAP version 13\n# pass 2\n# fail 0\n" }), "success");
  assert.equal(inferOutcome({ tool_response: { stdout: "TAP version 13\n# pass 2\n# fail 0\n", stderr: "", interrupted: false } }), "success");
  assert.equal(inferOutcome({ tool_response: { stdout: "regression ok", stderr: "", interrupted: false } }), "success");
  const priorRoot = process.env.PLUGIN_ROOT;
  process.env.PLUGIN_ROOT = "/plugin";
  try {
    assert.equal(inferOutcome({ tool_response: { stdout: "regression ok", stderr: "", interrupted: false } }), "unknown");
  } finally {
    if (priorRoot === undefined) delete process.env.PLUGIN_ROOT;
    else process.env.PLUGIN_ROOT = priorRoot;
  }
  assert.equal(inferOutcome({ tool_response: "" }), "unknown");
  assert.equal(inferOutcome({}), "unknown");
});

test("a valid work-order mutation binds the current session", () => {
  const root = fixture();
  const path = join(root, ".debug-workflow", "20260808-login.md");
  writeFileSync(path, `# Debug Work Order\n\n\`\`\`json debug-work-order/v1\n${JSON.stringify(workOrder(), null, 2)}\n\`\`\`\n`);

  const result = bindWorkOrderAfterMutation({
    cwd: root,
    sessionId: "session-a",
    touchedPaths: [path],
    now: 1_723_097_600_000,
  });

  assert.equal(result.kind, "bound");
  assert.equal(result.state.workOrderId, "DWO-20260808-login");
  assert.equal(result.state.activeBugId, "BUG-001");
});

test("skill load without a work order does not activate the workflow", () => {
  const root = fixture();
  const result = bindWorkOrderAfterMutation({
    cwd: root,
    sessionId: "session-a",
    touchedPaths: [],
    activeSkillIds: ["debug-workflow"],
    now: 1_723_097_600_000,
  });

  assert.deepEqual(result, { kind: "idle" });
});

test("a valid paused work order still records workflow entry without an active lease", () => {
  const root = fixture();
  const path = join(root, ".debug-workflow", "20260808-login.md");
  const paused = workOrder();
  paused.status = "paused";
  paused.run.state = "paused";
  paused.bugs[0].status = "blocked";
  writeFileSync(path, `# Debug Work Order\n\n\`\`\`json debug-work-order/v1\n${JSON.stringify(paused, null, 2)}\n\`\`\`\n`);
  const result = bindWorkOrderAfterMutation({ cwd: root, sessionId: "paused-session", touchedPaths: [path] });
  assert.equal(result.kind, "bound");
  assert.equal(result.active, false);
  assert.equal(result.state.workOrderId, paused.id);
});

test("public hook entry activates on writer command and allows an active turn stop", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-hook-data-"));
  const created = openLedger(root);
  const activated = await runHook("post", writerEvent(root, created, "public-session"), { PLUGIN_DATA: data });
  assert.equal(activated.code, 0, activated.stderr);
  assert.match(activated.stdout, /Bound DWO-/u);

  const stopped = await runHook("stop", { cwd: root, session_id: "public-session", last_assistant_message: "Still investigating the failing reproduction." }, { PLUGIN_DATA: data });
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.doesNotMatch(stopped.stdout, /"decision":"block"/u);
});

test("public hook permits a paused architecture-review handoff without completion evidence", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-paused-stop-data-"));
  const created = openLedger(root);
  await runHook("post", writerEvent(root, created, "paused-stop-session"), { PLUGIN_DATA: data });
  const paused = pauseLedger({
    cwd: root,
    id: created.id,
    nextAction: "review the failed candidates before another production edit",
    architectureReview: true,
    recovery: "node --test test/login.test.mjs",
  });
  const pauseCommand = `node ${WRITER} debug pause --cwd ${root} --id ${created.id} --next review --architecture-review`;
  await runHook("post", {
    cwd: root,
    session_id: "paused-stop-session",
    tool_name: "Bash",
    tool_input: { command: pauseCommand },
    tool_response: { exit_code: 0, stdout: JSON.stringify(paused) },
  }, { PLUGIN_DATA: data });

  const stopped = await runHook("stop", { cwd: root, session_id: "paused-stop-session", last_assistant_message: `Paused at ${created.id}` }, { PLUGIN_DATA: data });
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stdout, "", stopped.stdout);
});

test("Codex apply_patch shape extracts the work-order path and emits PostToolUse feedback", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-data-"));
  const created = openLedger(root);
  const result = await runHook("post", writerEvent(root, created, "codex-session"), { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin", DEEPSEEK_MODEL: "deepseek-v4-flash" });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Bound DWO-/u);
});

test("Codex can recover an apply_patch target from structured response changes", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-response-data-"));
  const created = openLedger(root);
  const result = await runHook("post", writerEvent(root, created, "codex-response-session"), { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin", DEEPSEEK_MODEL: "deepseek-v4-flash", AI_EXPERTS_SESSION_ID: "codex-response-session" });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Bound DWO-/u);
});

test("Codex PostToolUse keeps stderr feedback host-visible", async () => {
  const result = await runHook("post", {}, { PLUGIN_ROOT: "/plugin" });
  assert.equal(result.code, 0);

  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-feedback-data-"));
  const created = openLedger(root);
  const feedback = await runHook("post", writerEvent(root, created, "feedback-session"), { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin", DEEPSEEK_MODEL: "deepseek-v4-flash" });
  assert.equal(feedback.code, 0, feedback.stderr);
  assert.match(feedback.stderr, /Bound DWO-/u);
});

test("Codex PostToolUse reports advisory context on stderr without interposing JSON", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-standard-codex-data-"));
  const created = openLedger(root);
  const feedback = await runHook("post", writerEvent(root, created, "standard-codex"), { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin", DEEPSEEK_MODEL: "" });
  assert.equal(feedback.code, 0, feedback.stderr);
  assert.equal(feedback.stdout, "");
  assert.match(feedback.stderr, /\[Debugging Workflow Guard\] Bound DWO-/u);
});

test("Codex observes write_stdin only after tool use", () => {
  const hooks = JSON.parse(readFileSync(CODEX_HOOKS, "utf8")).hooks;
  const preMatchers = hooks.PreToolUse.map((route) => route.matcher ?? "").join("|");
  const postMatchers = hooks.PostToolUse.map((route) => route.matcher ?? "").join("|");
  assert.doesNotMatch(preMatchers, /write_stdin/u);
  assert.match(postMatchers, /(?:^|\|)write_stdin(?:\||$)/u);
  assert.match(postMatchers, /(?:^|\|)functions\.write_stdin(?:\||$)/u);
});

test("Codex long-running reproduction finalizes through write_stdin", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-async-data-"));
  const created = openLedger(root);
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin" };
  await runHook("post", writerEvent(root, created, "async-session"), env);

  await runHook("post", {
    cwd: root,
    session_id: "async-session",
    tool_name: "exec_command",
    tool_use_id: "exec-1",
    tool_input: { command: "node --test test/login.test.mjs" },
    tool_response: { session_id: 731, output: "Process running with session ID 731" },
  }, env);
  const pending = sessionState(root);
  assert.equal(pending.pendingCommands.length, 1);
  assert.deepEqual(pending.receipts, []);
  assert.doesNotMatch(JSON.stringify(pending.pendingCommands), /node --test|still running/u);
  await runHook("post", {
    cwd: root,
    session_id: "async-session",
    tool_name: "write_stdin",
    tool_input: { session_id: 731, chars: "" },
    tool_response: { session_id: 731, output: "TAP version 13\n# still running" },
  }, env);
  await runHook("post", {
    cwd: root,
    session_id: "async-session",
    tool_name: "functions.write_stdin",
    tool_input: { session_id: 731, chars: "" },
    tool_response: { exit_code: 1, output: "not ok 1 - login\n# fail 1" },
  }, env);

  const state = sessionState(root);
  assert.deepEqual(state.pendingCommands, []);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].kind, "reproduction");
  assert.equal(state.receipts[0].outcome, "failure");

  const production = await runHook("pre", {
    cwd: root,
    session_id: "async-session",
    tool_name: "Write",
    tool_input: { file_path: join(root, "src", "login.js") },
  }, env);
  assert.equal(production.stdout, "", production.stdout);
});

test("a successful long-running reproduction does not unlock production mutation", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-async-success-data-"));
  const created = openLedger(root);
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin" };
  await runHook("post", writerEvent(root, created, "async-success-session"), env);
  await runHook("post", {
    cwd: root,
    session_id: "async-success-session",
    tool_name: "exec_command",
    tool_use_id: "exec-2",
    tool_input: { command: "node --test test/login.test.mjs" },
    tool_response: { session_id: 732, output: "Process running with session ID 732" },
  }, env);
  await runHook("post", {
    cwd: root,
    session_id: "async-success-session",
    tool_name: "write_stdin",
    tool_input: { session_id: 732, chars: "" },
    tool_response: { exit_code: 0, output: "ok 1 - login\n# pass 1\n# fail 0" },
  }, env);

  const state = sessionState(root);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].outcome, "success");
  const production = await runHook("pre", {
    cwd: root,
    session_id: "async-success-session",
    tool_name: "Write",
    tool_input: { file_path: join(root, "src", "login.js") },
  }, env);
  assert.match(production.stdout, /"permissionDecision":"deny"/u);
});

test("an unrelated write_stdin result cannot finalize a pending command", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-async-token-data-"));
  const created = openLedger(root);
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin" };
  await runHook("post", writerEvent(root, created, "async-token-session"), env);
  await runHook("post", {
    cwd: root,
    session_id: "async-token-session",
    tool_name: "exec_command",
    tool_use_id: "exec-3",
    tool_input: { command: "node --test test/login.test.mjs" },
    tool_response: { session_id: 733, output: "Process running with session ID 733" },
  }, env);
  await runHook("post", {
    cwd: root,
    session_id: "async-token-session",
    tool_name: "write_stdin",
    tool_input: { session_id: 999, chars: "" },
    tool_response: { exit_code: 1, output: "not ok 1 - unrelated" },
  }, env);

  const state = sessionState(root);
  assert.equal(state.pendingCommands.length, 1);
  assert.deepEqual(state.receipts, []);
  const production = await runHook("pre", {
    cwd: root,
    session_id: "async-token-session",
    tool_name: "Write",
    tool_input: { file_path: join(root, "src", "login.js") },
  }, env);
  assert.match(production.stdout, /"permissionDecision":"deny"/u);
});

test("cross-session and unknown terminal results cannot fabricate a failure receipt", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-async-unknown-data-"));
  const created = openLedger(root);
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin" };
  await runHook("post", writerEvent(root, created, "async-owner-session"), env);
  await runHook("post", {
    cwd: root,
    session_id: "async-owner-session",
    tool_name: "exec_command",
    tool_use_id: "exec-unknown",
    tool_input: { command: "node --test test/login.test.mjs" },
    tool_response: { session_id: 735, output: "Process running with session ID 735" },
  }, env);
  await runHook("post", {
    cwd: root,
    session_id: "different-session",
    tool_name: "write_stdin",
    tool_input: { session_id: 735, chars: "" },
    tool_response: { exit_code: 1, output: "not ok 1 - unrelated session" },
  }, env);
  assert.equal(sessionState(root).pendingCommands.length, 1);

  await runHook("post", {
    cwd: root,
    session_id: "async-owner-session",
    tool_name: "write_stdin",
    tool_input: { session_id: 735, chars: "" },
    tool_response: { output: "command ended without a trustworthy status" },
  }, env);
  const state = sessionState(root);
  assert.deepEqual(state.pendingCommands, []);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].outcome, "unknown");
  assert.equal(state.receipts.some((receipt) => receipt.outcome === "failure"), false);

  const production = await runHook("pre", {
    cwd: root,
    session_id: "async-owner-session",
    tool_name: "Write",
    tool_input: { file_path: join(root, "src", "login.js") },
  }, env);
  assert.match(production.stdout, /"permissionDecision":"deny"/u);
});

test("a terminal command replay consumes pending state without duplicating the receipt", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-codex-async-replay-data-"));
  const created = openLedger(root);
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin" };
  await runHook("post", writerEvent(root, created, "async-replay-session"), env);
  const command = "node --test test/login.test.mjs";
  await runHook("post", {
    cwd: root,
    session_id: "async-replay-session",
    tool_name: "exec_command",
    tool_use_id: "exec-4",
    tool_input: { command },
    tool_response: { session_id: 734, output: "Process running with session ID 734" },
  }, env);
  await runHook("post", {
    cwd: root,
    session_id: "async-replay-session",
    tool_name: "exec_command",
    tool_use_id: "exec-4",
    tool_input: { command },
    tool_response: { exit_code: 1, output: "not ok 1 - login\n# fail 1" },
  }, env);

  const state = sessionState(root);
  assert.deepEqual(state.pendingCommands, []);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].outcome, "failure");
});

test("stderr redirection to dev null does not count as a production mutation", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-redirection-data-"));
  const created = openLedger(root);
  await runHook("post", writerEvent(root, created, "redirect-session"), { PLUGIN_DATA: data });
  await runHook("post", {
    cwd: root,
    session_id: "redirect-session",
    tool_name: "Bash",
    tool_input: { command: "node --test test/login.test.mjs 2>/dev/null" },
    tool_response: { exit_code: 1 },
  }, { PLUGIN_DATA: data });

  const sessions = join(root, ".debug-workflow", ".state", "sessions");
  const stateFile = readdirSync(sessions).find((name) => name.endsWith(".json"));
  const state = JSON.parse(readFileSync(join(sessions, stateFile), "utf8"));
  assert.equal(state.mutationSeq, 0);
  assert.equal(state.receipts.at(-1).kind, "command");
});

test("quoted diagnostic arrows do not count as shell mutations", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-quoted-arrow-data-"));
  const created = openLedger(root);
  await runHook("post", writerEvent(root, created, "quoted-arrow-session"), { PLUGIN_DATA: data });
  await runHook("post", {
    cwd: root,
    session_id: "quoted-arrow-session",
    tool_name: "Bash",
    tool_input: { command: "for f in a; do t=b; echo \"$f -> $t\"; done" },
    tool_response: { exit_code: 0, stdout: "a -> b" },
  }, { PLUGIN_DATA: data });

  const sessions = join(root, ".debug-workflow", ".state", "sessions");
  const stateFile = readdirSync(sessions).find((name) => name.endsWith(".json"));
  const state = JSON.parse(readFileSync(join(sessions, stateFile), "utf8"));
  assert.equal(state.mutationSeq, 0);
  assert.equal(state.receipts.at(-1).kind, "command");
});

test("an invalid work-order mutation remains bound until corrected", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-invalid-data-"));
  const path = join(root, ".debug-workflow", "20260808-invalid.md");
  writeFileSync(path, "# Missing machine block\n");
  const event = { cwd: root, session_id: "invalid-session", tool_name: "Write", tool_input: { file_path: path } };
  const invalid = await runHook("post", event, { PLUGIN_DATA: data });
  assert.match(invalid.stdout, /do not activate the workflow/u);
  const denied = await runHook("pre", event, { PLUGIN_DATA: data });
  assert.match(denied.stdout, /"permissionDecision":"deny"/u);
  assert.match(denied.stdout, /ledger/u);
});

test("a failed initial work-order write without a file does not activate", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-missing-data-"));
  const path = join(root, ".debug-workflow", "20260808-login.md");
  const failedWrite = { cwd: root, session_id: "missing-session", tool_name: "Write", tool_input: { file_path: path }, error: "write failed" };
  const failed = await runHook("failure", failedWrite, { PLUGIN_DATA: data });
  assert.match(failed.stdout, /"hookEventName":"PostToolUseFailure"/u);
  assert.match(failed.stdout, /workflow was not activated/u);

  const retry = await runHook("pre", { cwd: root, session_id: "missing-session", tool_name: "Write", tool_input: { file_path: path } }, { PLUGIN_DATA: data });
  assert.match(retry.stdout, /"permissionDecision":"deny"/u);

  const production = await runHook("pre", { cwd: root, session_id: "missing-session", tool_name: "Write", tool_input: { file_path: join(root, "src", "login.js") } }, { PLUGIN_DATA: data });
  assert.equal(production.stdout, "", production.stdout);
});

test("correcting a transiently invalid bound work order preserves prior receipts", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-preserve-data-"));
  const created = openLedger(root);
  await runHook("post", writerEvent(root, created, "preserve-session"), { PLUGIN_DATA: data });
  await runHook("post", {
    cwd: root,
    session_id: "preserve-session",
    tool_name: "Bash",
    tool_input: { command: "node --test test/login.test.mjs" },
    tool_response: { exit_code: 1 },
  }, { PLUGIN_DATA: data });

  const rebound = bindWorkOrderAfterMutation({ cwd: root, sessionId: "preserve-session", touchedPaths: [created.path] });
  assert.equal(rebound.kind, "bound");

  const sessions = join(root, ".debug-workflow", ".state", "sessions");
  const stateFile = readdirSync(sessions).find((name) => name.endsWith(".json"));
  const state = JSON.parse(readFileSync(join(sessions, stateFile), "utf8"));
  assert.deepEqual(state.receipts.map((receipt) => receipt.id), ["R-2"]);
  assert.equal(state.receipts[0].kind, "reproduction");
});

test("SessionStart discovery reports but does not bind", async () => {
  const root = fixture();
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-session-data-"));
  const path = join(root, ".debug-workflow", "20260808-login.md");
  writeFileSync(path, `# Debug Work Order\n\n\`\`\`json debug-work-order/v1\n${JSON.stringify(workOrder(), null, 2)}\n\`\`\`\n`);
  const session = await runHook("session", { cwd: root, session_id: "discovery" }, { PLUGIN_DATA: data });
  assert.match(session.stdout, /none was activated/u);
  const pre = await runHook("pre", { cwd: root, session_id: "discovery", tool_name: "Write", tool_input: { file_path: join(root, "src.js") } }, { PLUGIN_DATA: data });
  assert.equal(pre.stdout, "");
});

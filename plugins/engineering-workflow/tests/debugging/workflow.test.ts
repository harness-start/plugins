import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolveConfig } from "../../src/domains/debugging/lib/config.js";
import { extractWorkOrder, validateWorkOrder } from "../../src/domains/debugging/lib/work-order.js";
import {
  bindWorkOrderAfterMutation,
  closeBinding,
  completionFindings,
  preMutationDecision,
  preCommandDecision,
  recordReceipt,
  refreshBoundWorkOrder,
} from "../../src/domains/debugging/lib/workflow.js";

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

function fixture(value = order()) {
  const root = mkdtempSync(join(tmpdir(), "debug-workflow-test-"));
  const data = mkdtempSync(join(tmpdir(), "debug-workflow-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, ".debug-workflow"), { recursive: true });
  const path = join(root, ".debug-workflow", "20260808-two-bugs.md");
  writeOrder(path, value);
  return { root, data, path };
}

function writeOrder(path, value) {
  writeFileSync(path, `# Debug Work Order\n\n\`\`\`json debug-work-order/v1\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`);
}

function withData(data, callback) {
  const before = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = data;
  try { return callback(); }
  finally {
    if (before === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = before;
  }
}

test("parser requires exactly one canonical machine block", () => {
  const block = `\`\`\`json debug-work-order/v1\n${JSON.stringify(order())}\n\`\`\``;
  assert.equal(extractWorkOrder(block).ok, true);
  assert.match(extractWorkOrder(`${block}\n${block}`).error, /exactly one/u);
  assert.match(extractWorkOrder(JSON.stringify(order())).error, /found 0/u);
});

test("schema rejects unknown fields and ambiguous active bugs", () => {
  const config = resolveConfig(null);
  const unknown = order({ surprise: true });
  assert.match(validateWorkOrder(unknown, config).findings.join("\n"), /unknown field: surprise/u);

  const ambiguous = order();
  ambiguous.bugs[1].status = "fixing";
  assert.match(validateWorkOrder(ambiguous, config).findings.join("\n"), /exactly one active bug/u);

  const mismatched = order({ status: "paused" });
  assert.match(validateWorkOrder(mismatched, config).findings.join("\n"), /requires run.state paused/u);
});

test("schema errors name the accepted lifecycle values", () => {
  const config = resolveConfig(null);
  const invalid = order();
  invalid.bugs[0].status = "working";
  invalid.bugs[0].hypotheses[0].status = "likely";
  invalid.bugs[0].rootCause.status = "confirmed";
  invalid.bugs[0].fix.status = "fixing";

  const findings = validateWorkOrder(invalid, config).findings.join("\n");
  assert.match(findings, /bugs\[0\]\.status must be one of: .*investigating.*fixing.*verifying/u);
  assert.match(findings, /hypotheses\[0\]\.status must be one of: open, supported, falsified/u);
  assert.match(findings, /rootCause\.status must be one of: unknown, inferred, supported/u);
  assert.match(findings, /fix\.status must be one of: not-started, in-progress, applied, reverted/u);

  const annotatedReceipt = order();
  annotatedReceipt.bugs[0].fix.firstRevision = "R-3 (first mutation)";
  assert.match(validateWorkOrder(annotatedReceipt, config).findings.join("\n"), /fix\.firstRevision must be null or match R-N/u);
});

test("config rejects ledger roots that escape through an intermediate parent segment", () => {
  const warnings = [];
  const config = resolveConfig({ ledger: { root: "safe/../../outside" } }, (warning) => warnings.push(warning));
  assert.equal(config.ledger.root, ".debug-workflow");
  assert.match(warnings.join("\n"), /inside the repository/u);
});

test("receipts stay attributed when the active bug changes", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "bound");
    const first = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
    assert.equal(first.receipt.bugId, "BUG-001");

    const next = order({ activeBugId: "BUG-002" });
    next.bugs[0].status = "blocked";
    next.bugs[1].status = "investigating";
    next.resume = { nextBugId: "BUG-002", nextAction: "reproduce second bug", recoveryCommands: [] };
    writeOrder(fx.path, next);
    assert.equal(refreshBoundWorkOrder({ cwd: fx.root, sessionId: "s1" }).kind, "active");
    const second = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-002.test.mjs", outcome: "failure" });
    assert.equal(second.receipt.bugId, "BUG-002");
    assert.deepEqual(second.state.receipts.map((receipt) => receipt.bugId), ["BUG-001", "BUG-002"]);
  });
});

test("three failed post-mutation reproductions freeze only the current bug", () => {
  const fx = fixture();
  withData(fx.data, () => {
    bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] });
    recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
    recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "mutation", paths: [join(fx.root, "src.js")], outcome: "success" });
    for (let index = 0; index < 3; index += 1) recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
    const frozen = preMutationDecision({ cwd: fx.root, sessionId: "s1", paths: [join(fx.root, "src.js")] });
    assert.equal(frozen.action, "block");
    assert.match(frozen.reason, /architecture-review/u);

    const next = order({ activeBugId: "BUG-002" });
    next.bugs[0].status = "architecture-review";
    next.bugs[1].status = "investigating";
    next.resume = { nextBugId: "BUG-002", nextAction: "isolate second bug", recoveryCommands: [] };
    writeOrder(fx.path, next);
    recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-002.test.mjs", outcome: "failure" });
    const evidence = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node inspect-second.mjs", outcome: "success" });
    next.bugs[1].status = "fixing";
    next.bugs[1].hypotheses[0].status = "supported";
    next.bugs[1].hypotheses[0].evidenceRefs = [evidence.receipt.id];
    next.bugs[1].rootCause = { status: "supported", statement: "second parser branch rejects input", causalChain: ["input reaches second rejecting branch"], evidenceRefs: [evidence.receipt.id] };
    next.bugs[1].fix.status = "in-progress";
    next.bugs[1].fix.affectedBugIds = ["BUG-002"];
    writeOrder(fx.path, next);
    const allowed = preMutationDecision({ cwd: fx.root, sessionId: "s1", paths: [join(fx.root, "src.js")] });
    assert.equal(allowed.action, "allow");
  });
});

test("five identical command outcomes require a changed diagnostic experiment", () => {
  const fx = fixture();
  withData(fx.data, () => {
    bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] });
    for (let index = 0; index < 5; index += 1) {
      recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "adb shell dumpsys activity", outcome: "success" });
    }
    const repeated = preCommandDecision({ cwd: fx.root, sessionId: "s1", command: "adb shell dumpsys activity" });
    assert.equal(repeated.action, "block");
    assert.match(repeated.reason, /change the experiment|new evidence/iu);
    assert.equal(preCommandDecision({ cwd: fx.root, sessionId: "s1", command: "adb shell dumpsys package" }).action, "allow");
  });
});

test("production mutation requires an exact failing baseline and evidenced root cause", () => {
  const fx = fixture();
  withData(fx.data, () => {
    bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] });
    const codePath = join(fx.root, "src.js");
    assert.match(preMutationDecision({ cwd: fx.root, sessionId: "s1", paths: [codePath] }).reason, /exact reproduction command verbatim/u);

    const baseline = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
    assert.equal(baseline.receipt.kind, "reproduction");
    assert.equal(preMutationDecision({ cwd: fx.root, sessionId: "s1", paths: [codePath] }).action, "allow");

    const ready = order();
    ready.bugs[0].fix.affectedBugIds = ["BUG-001", "BUG-002"];
    writeOrder(fx.path, ready);
    assert.match(preMutationDecision({ cwd: fx.root, sessionId: "s1", paths: [codePath] }).reason, /affected bug BUG-002.*failing baseline/u);

    ready.activeBugId = "BUG-002";
    ready.bugs[0].status = "queued";
    ready.bugs[1].status = "investigating";
    writeOrder(fx.path, ready);
    recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-002.test.mjs", outcome: "failure" });
    ready.activeBugId = "BUG-001";
    ready.bugs[0].status = "fixing";
    ready.bugs[1].status = "queued";
    writeOrder(fx.path, ready);
    assert.equal(preMutationDecision({ cwd: fx.root, sessionId: "s1", paths: [codePath] }).action, "allow");
  });
});

test("closed architecture-review remains an explicit terminal handoff", () => {
  const fx = fixture();
  withData(fx.data, () => {
    bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] });
    const next = order({
      status: "closed",
      run: { epoch: 1, state: "closed", mode: "investigate-and-fix" },
      activeBugId: null,
    });
    next.bugs[0].status = "architecture-review";
    next.bugs[1].status = "deferred";
    writeOrder(fx.path, next);
    const live = refreshBoundWorkOrder({ cwd: fx.root, sessionId: "s1" });
    assert.deepEqual(completionFindings(live), []);
  });
});

test("completion rejects forged and cross-bug evidence", () => {
  const configured = order();
  configured.bugs[0].symptom.userOutcome = "BUG-001 user-visible behavior succeeds";
  configured.bugs[0].symptom.acceptance = "node --test BUG-001.acceptance.test.mjs";
  const fx = fixture(configured);
  withData(fx.data, () => {
    bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] });
    const baseline = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "failure" });
    assert.equal(baseline.receipt.id, "R-2");
    const evidence = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node inspect.mjs", outcome: "success" });
    const changed = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "mutation", paths: [join(fx.root, "src.js")], outcome: "success" });
    assert.equal(changed.receipt.kind, "mutation");
    const repro = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.test.mjs", outcome: "success" });
    const acceptance = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node --test BUG-001.acceptance.test.mjs", outcome: "success" });
    const regression = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "npm test", outcome: "success" });
    const cleanup = recordReceipt({ cwd: fx.root, sessionId: "s1", kind: "command", command: "node cleanup-check.mjs", outcome: "success" });

    const resolved = order({ status: "closed", run: { epoch: 1, state: "closed", mode: "investigate-and-fix" }, activeBugId: null });
    resolved.bugs[0].status = "resolved";
    resolved.bugs[0].symptom.userOutcome = "BUG-001 user-visible behavior succeeds";
    resolved.bugs[0].symptom.acceptance = "node --test BUG-001.acceptance.test.mjs";
    resolved.bugs[0].verification = { originalReproduction: null, regression: [], debugCleanup: null };
    resolved.bugs[1].status = "deferred";
    resolved.resume = { nextBugId: "BUG-002", nextAction: "await independent fixture", recoveryCommands: [] };
    writeOrder(fx.path, resolved);
    const live = refreshBoundWorkOrder({ cwd: fx.root, sessionId: "s1" });
    assert.match(completionFindings({
      kind: "inactive",
      workOrder: resolved,
      state: { receipts: live.state.receipts.filter((receipt) => receipt.id !== regression.receipt.id), mutationSeq: live.state.mutationSeq },
    }).join("\n"), /regression|cleanup/u);
    assert.doesNotMatch(completionFindings(live).join("\n"), /regression verification is missing/u);
    assert.ok(baseline && evidence && changed && repro && acceptance && cleanup);
  });
});

test("completion requires a post-mutation receipt for the declared user-visible acceptance command", () => {
  const finished = order({
    status: "closed",
    run: { epoch: 1, state: "closed", mode: "investigate-and-fix" },
    activeBugId: null,
  });
  finished.bugs[0].status = "resolved";
  finished.bugs[0].symptom.userOutcome = "BUG-001 user-visible behavior succeeds";
  finished.bugs[0].symptom.acceptance = "node --test BUG-001.acceptance.test.mjs";
  finished.bugs[1].status = "deferred";
  const receipts = [
    { id: "R-2", bugId: "BUG-001", kind: "reproduction", outcome: "failure", commandHash: null, mutationSeq: 0 },
    { id: "R-3", bugId: "BUG-001", kind: "mutation", outcome: "success", commandHash: null, mutationSeq: 3 },
    { id: "R-4", bugId: "BUG-001", kind: "reproduction", outcome: "success", commandHash: null, mutationSeq: 3 },
    { id: "R-5", bugId: "BUG-001", kind: "verification", outcome: "success", commandHash: null, mutationSeq: 3 },
    { id: "R-6", bugId: "BUG-001", kind: "command", outcome: "success", commandHash: null, mutationSeq: 3 },
  ];

  const findings = completionFindings({ kind: "inactive", workOrder: finished, state: { receipts, mutationSeq: 3 } });

  assert.match(findings.join("\n"), /user-visible acceptance command/u);
});

test("completion scopes baselines and freshness to each bug's relevant mutations", () => {
  const finished = order({
    status: "closed",
    run: { epoch: 1, state: "closed", mode: "investigate-and-fix" },
    activeBugId: null,
  });
  finished.resume = { nextBugId: null, nextAction: "work order complete", recoveryCommands: [] };
  const receipts = [
    { id: "R-2", bugId: "BUG-001", kind: "reproduction", outcome: "failure", mutationSeq: 0 },
    { id: "R-3", bugId: "BUG-001", kind: "command", outcome: "success", mutationSeq: 0 },
    { id: "R-4", bugId: "BUG-001", kind: "mutation", outcome: "success", mutationSeq: 4 },
    { id: "R-5", bugId: "BUG-001", kind: "reproduction", outcome: "success", mutationSeq: 4 },
    { id: "R-6", bugId: "BUG-001", kind: "verification", outcome: "success", mutationSeq: 4 },
    { id: "R-7", bugId: "BUG-001", kind: "command", outcome: "success", mutationSeq: 4 },
    { id: "R-8", bugId: "BUG-002", kind: "reproduction", outcome: "failure", mutationSeq: 4 },
    { id: "R-9", bugId: "BUG-002", kind: "command", outcome: "success", mutationSeq: 4 },
    { id: "R-10", bugId: "BUG-002", kind: "mutation", outcome: "success", mutationSeq: 10 },
    { id: "R-11", bugId: "BUG-002", kind: "reproduction", outcome: "success", mutationSeq: 10 },
    { id: "R-12", bugId: "BUG-002", kind: "verification", outcome: "success", mutationSeq: 10 },
    { id: "R-13", bugId: "BUG-002", kind: "command", outcome: "success", mutationSeq: 10 },
  ];
  for (const [index, item] of finished.bugs.entries()) {
    const evidence = index === 0 ? "R-3" : "R-9";
    const mutation = index === 0 ? "R-4" : "R-10";
    const repro = index === 0 ? "R-5" : "R-11";
    const regression = index === 0 ? "R-6" : "R-12";
    const cleanup = index === 0 ? "R-7" : "R-13";
    item.status = "resolved";
    item.hypotheses[0] = { ...item.hypotheses[0], status: "supported", evidenceRefs: [evidence] };
    item.rootCause = { status: "supported", statement: "implementation diverges", causalChain: ["input reaches wrong branch"], evidenceRefs: [evidence] };
    item.fix = { status: "applied", firstRevision: mutation, affectedBugIds: [item.id], summary: "repair branch" };
    item.verification = { originalReproduction: { receiptId: repro }, regression: [{ receiptId: regression }], debugCleanup: { receiptId: cleanup } };
  }
  receipts.find((receipt) => receipt.id === "R-7").outcome = "unknown";
  receipts.find((receipt) => receipt.id === "R-13").outcome = "unknown";
  const live = { kind: "inactive", workOrder: finished, state: { receipts, mutationSeq: 10 } };
  assert.deepEqual(completionFindings(live), []);

  const withoutRepro = { kind: "inactive", workOrder: finished, state: { receipts: receipts.filter((receipt) => receipt.id !== "R-5"), mutationSeq: 10 } };
  assert.match(completionFindings(withoutRepro).join("\n"), /original reproduction/u);
});

test("a live lease rejects another session and an increased epoch resumes after expiry", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path], now: 1000 }).kind, "bound");
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s2", touchedPaths: [fx.path], now: 2000 }).kind, "conflict");
    const resumed = order({ run: { epoch: 2, state: "active", mode: "investigate-and-fix" } });
    writeOrder(fx.path, resumed);
    const afterExpiry = bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s2", touchedPaths: [fx.path], now: 1000 + 121 * 60_000 });
    assert.equal(afterExpiry.kind, "bound", JSON.stringify(afterExpiry.findings ?? []));
    assert.equal(afterExpiry.state.epoch, 2);
  });
});

test("one session cannot silently switch to a different work order", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "bound");
    const secondPath = join(fx.root, ".debug-workflow", "20260808-second.md");
    writeOrder(secondPath, order({ id: "DWO-20260808-second" }));
    const switched = bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [secondPath] });
    assert.equal(switched.kind, "conflict");
    assert.match(switched.findings.join("\n"), /already bound/u);
  });
});

test("one session can bind a new work order after the previous one is aborted", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "bound");
    const aborted = order({
      status: "aborted",
      run: { epoch: 1, state: "closed", mode: "investigate-and-fix" },
      activeBugId: null,
    });
    aborted.bugs[0].status = "blocked";
    aborted.bugs[1].status = "deferred";
    writeOrder(fx.path, aborted);
    assert.equal(closeBinding({ cwd: fx.root, sessionId: "s1" }).kind, "inactive");

    const secondPath = join(fx.root, ".debug-workflow", "20260808-second.md");
    writeOrder(secondPath, order({ id: "DWO-20260808-second" }));
    const switched = bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [secondPath] });

    assert.equal(switched.kind, "bound", JSON.stringify(switched.findings ?? []));
    assert.equal(switched.workOrder.id, "DWO-20260808-second");
  });
});

test("one session can bind a new work order after a completed terminal work order", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "bound");
    const closed = order({
      status: "closed",
      run: { epoch: 1, state: "closed", mode: "investigate-and-fix" },
      activeBugId: null,
    });
    closed.bugs[0].status = "deferred";
    closed.bugs[1].status = "deferred";
    writeOrder(fx.path, closed);
    assert.equal(closeBinding({ cwd: fx.root, sessionId: "s1" }).kind, "inactive");

    const secondPath = join(fx.root, ".debug-workflow", "20260808-after-close.md");
    writeOrder(secondPath, order({ id: "DWO-20260808-after-close" }));
    const switched = bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [secondPath] });

    assert.equal(switched.kind, "bound", JSON.stringify(switched.findings ?? []));
  });
});

test("one session can bind a new work order after explicitly pausing the previous one", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "bound");
    const paused = order({
      status: "paused",
      run: { epoch: 1, state: "paused", mode: "investigate-and-fix" },
      activeBugId: null,
    });
    paused.bugs[0].status = "blocked";
    paused.bugs[1].status = "queued";
    writeOrder(fx.path, paused);
    assert.equal(closeBinding({ cwd: fx.root, sessionId: "s1" }).kind, "inactive");

    const secondPath = join(fx.root, ".debug-workflow", "20260808-after-pause.md");
    writeOrder(secondPath, order({ id: "DWO-20260808-after-pause" }));
    const switched = bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [secondPath] });

    assert.equal(switched.kind, "bound", JSON.stringify(switched.findings ?? []));
  });
});

test("invalid correction cannot replace the bound id on the same path", () => {
  const fx = fixture();
  withData(fx.data, () => {
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "bound");
    writeFileSync(fx.path, "# Temporarily invalid\n");
    assert.equal(bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] }).kind, "invalid");
    writeOrder(fx.path, order({ id: "DWO-20260808-replacement" }));
    const replaced = bindWorkOrderAfterMutation({ cwd: fx.root, sessionId: "s1", touchedPaths: [fx.path] });
    assert.equal(replaced.kind, "invalid");
    assert.match(replaced.findings.join("\n"), /preserve its id and run\.epoch/u);
    assert.equal(replaced.state.workOrderId, "DWO-20260808-two-bugs");
  });
});

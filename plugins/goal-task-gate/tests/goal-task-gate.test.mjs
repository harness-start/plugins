import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  formatCompletionTrailer,
  parseCompletionTrailer,
  validateTrailerAgainstTrail,
} from "../scripts/lib/completion-trailer.mjs";
import { resolveConfig } from "../scripts/lib/config.mjs";
import {
  classifyGoalPrompt,
  isProtectedTrailFile,
  isPureLogHelperCommand,
  looksLikeCompletionClaim,
  shellLooksMutating,
  shellTouchesProtectedTrail,
} from "../scripts/lib/policy.mjs";
import {
  appendDecision,
  auditPaths,
  createRun,
  loadDecisions,
  makeRunId,
  rewriteTip,
  trailTipSummary,
  validateDecisionChain,
} from "../scripts/lib/trail.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/goal-task-gate.mjs", import.meta.url));
const LOG_DECISION = fileURLToPath(new URL("../scripts/log-decision.mjs", import.meta.url));

function runHook(mode, event, env = {}) {
  const result = spawnSync(process.execPath, [ENTRY, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function workspace() {
  return mkdtempSync(join(tmpdir(), "gtg-"));
}

test("classifyGoalPrompt: arm / clear / ignore", () => {
  assert.equal(classifyGoalPrompt("/goal migrate auth until tests pass").class, "arm");
  assert.equal(
    classifyGoalPrompt("/goal migrate auth until tests pass").objective,
    "migrate auth until tests pass",
  );
  assert.equal(classifyGoalPrompt("/goal clear").class, "clear");
  assert.equal(classifyGoalPrompt("/goal stop").class, "clear");
  assert.equal(classifyGoalPrompt("/goal resume").class, "ignore");
  assert.equal(classifyGoalPrompt("/goal status").class, "ignore");
  assert.equal(classifyGoalPrompt("/goal").class, "ignore");
  assert.equal(classifyGoalPrompt("please /goal later").class, "other");
  assert.equal(classifyGoalPrompt("# goal-task-abort").class, "abort");
});

test("completion trailer parse and validate", () => {
  const line = formatCompletionTrailer({
    runId: "r1",
    closeSeq: 3,
    tipHash: "abc12345",
  });
  const msg = `Done work.\n\n${line}\n`;
  const t = parseCompletionTrailer(msg);
  assert.equal(t.runId, "r1");
  assert.equal(t.closeSeq, 3);
  assert.equal(t.tipHash, "abc12345");
  const ok = validateTrailerAgainstTrail(t, {
    runId: "r1",
    closeSeq: 3,
    tipHash: "abc12345",
    kind: "close",
    chainValid: true,
  });
  assert.equal(ok.ok, true);
  const bad = validateTrailerAgainstTrail(t, {
    runId: "r1",
    closeSeq: 2,
    tipHash: "abc12345",
    kind: "close",
    chainValid: true,
  });
  assert.equal(bad.ok, false);
});

test("trail append + hash chain + tip rewrite", () => {
  const root = workspace();
  const runId = makeRunId();
  const { paths } = createRun(root, {
    auditRoot: ".goal-task",
    runId,
    objective: "demo",
    sessionId: "s1",
    host: "test",
    tipWindow: 3,
    writeOpenRow: true,
  });
  const a1 = appendDecision(
    paths.decisionsPath,
    {
      phase: "impl",
      kind: "implement",
      decision: "change foo",
      why: "need fix",
      evidence: "src/foo.ts",
      result: "ok",
    },
    { runId, sessionId: "s1", tipWindow: 3 },
  );
  assert.equal(a1.ok, true);
  const closedTooSoon = appendDecision(
    paths.decisionsPath,
    {
      phase: "end",
      kind: "close",
      decision: "goal complete",
      why: "author says so",
      evidence: "none",
      result: "ok",
    },
    { runId, sessionId: "s1", tipWindow: 3 },
  );
  assert.equal(closedTooSoon.ok, false);
  assert.match(closedTooSoon.error ?? "", /prior verify decision/u);
  const loaded = loadDecisions(paths.decisionsPath);
  assert.equal(loaded.rows.length, 2);
  const chain = validateDecisionChain(loaded.rows);
  assert.equal(chain.valid, true, chain.findings.join("; "));

  const rw = rewriteTip(
    paths.decisionsPath,
    1,
    [
      {
        phase: "impl",
        kind: "implement",
        decision: "change foo v2",
        why: "correct evidence",
        evidence: "src/foo.ts:10",
        result: "ok",
      },
    ],
    { runId, sessionId: "s1", tipWindow: 3 },
  );
  assert.equal(rw.ok, true);
  const after = loadDecisions(paths.decisionsPath);
  assert.equal(after.rows.length, 2);
  assert.equal(after.rows[1].decision, "change foo v2");
  assert.equal(validateDecisionChain(after.rows).valid, true);

  // sealed rewrite of 2 rows when only 2 exist with tipWindow 3 is OK
  // tamper sealed: break first row hash
  const text = readFileSync(paths.decisionsPath, "utf8");
  const lines = text.trimEnd().split("\n");
  const cells = lines[1].split("\t");
  cells[4] = "TAMPERED";
  lines[1] = cells.join("\t");
  writeFileSync(paths.decisionsPath, `${lines.join("\n")}\n`);
  const broken = loadDecisions(paths.decisionsPath);
  assert.equal(validateDecisionChain(broken.rows).valid, false);
});

test("isProtectedTrailFile and shell guard", () => {
  assert.equal(
    isProtectedTrailFile(".goal-task/runs/x/decisions.tsv"),
    true,
  );
  assert.equal(isProtectedTrailFile(".goal-task/runs/x/meta.json"), false);
  assert.equal(isProtectedTrailFile("src/app.js"), false);
  assert.equal(
    shellTouchesProtectedTrail("sed -i 's/a/b/' .goal-task/runs/x/decisions.tsv"),
    true,
  );
  assert.equal(
    shellTouchesProtectedTrail(
      "node scripts/log-decision.mjs --workspace . --phase p --kind open --decision d --why w --evidence e --result open",
    ),
    false,
  );
  // Helper name alone must not exempt a compound mutation (bug 1).
  assert.equal(
    shellTouchesProtectedTrail(
      "rm -f .goal-task/runs/x/decisions.tsv; echo log-decision.mjs",
    ),
    true,
  );
  assert.equal(
    isPureLogHelperCommand(
      "rm -f .goal-task/runs/x/decisions.tsv; echo log-decision.mjs",
    ),
    false,
  );
  // writeFileSync bypass (bug 2)
  assert.equal(shellLooksMutating("node -e \"require('fs').writeFileSync('.goal-task/runs/r/decisions.tsv','hack')\""), true);
  assert.equal(
    shellTouchesProtectedTrail(
      "node -e \"require('fs').writeFileSync('.goal-task/runs/r/decisions.tsv','hack')\"",
    ),
    true,
  );
  // Bare docs/decisions.tsv should not be protected trail under audit root
  assert.equal(
    shellTouchesProtectedTrail("echo hi > docs/decisions.tsv"),
    false,
  );
});

test("hook: arm inject, clear, supersede, deny trail write, complete trailer", () => {
  const root = workspace();
  const data = workspace();
  writeFileSync(join(root, ".gitignore"), "vendor/\n", "utf8");
  const session = "sess-gtg-1";
  const env = {
    PLUGIN_DATA: data,
    CLAUDE_PLUGIN_DATA: data,
  };

  const arm = runHook(
    "prompt",
    {
      cwd: root,
      session_id: session,
      prompt: "/goal all tests in test/auth pass",
    },
    env,
  );
  assert.equal(arm.status, 0, arm.stderr);
  assert.match(arm.stdout, /goal-task-gate/);
  assert.match(arm.stdout, /GOAL_TASK_DONE/);
  assert.match(arm.stdout, /armed run_id=/);

  const current = readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim();
  assert.ok(current);
  assert.ok(existsSync(join(root, ".goal-task", "runs", current, "decisions.tsv")));
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "vendor/\n");

  // deny write to decisions.tsv
  const deny = runHook(
    "pre",
    {
      cwd: root,
      session_id: session,
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".goal-task", "runs", current, "decisions.tsv"),
        content: "hack\n",
      },
    },
    env,
  );
  assert.match(deny.stdout, /"permissionDecision":"deny"/);

  // business write allowed
  const allow = runHook(
    "pre",
    {
      cwd: root,
      session_id: session,
      tool_name: "Write",
      tool_input: {
        file_path: join(root, "src", "app.js"),
        content: "x\n",
      },
    },
    env,
  );
  assert.doesNotMatch(allow.stdout, /"permissionDecision":"deny"/);

  // supersede
  const arm2 = runHook(
    "prompt",
    {
      cwd: root,
      session_id: session,
      prompt: "/goal different objective now",
    },
    env,
  );
  assert.match(arm2.stdout, /superseded/);
  const current2 = readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim();
  assert.notEqual(current2, current);
  assert.ok(existsSync(join(root, ".goal-task", "runs", current, "decisions.tsv")));

  // clear
  const cleared = runHook(
    "prompt",
    {
      cwd: root,
      session_id: session,
      prompt: "/goal clear",
    },
    env,
  );
  assert.match(cleared.stdout, /cleared/);
  const curAfter = readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim();
  assert.equal(curAfter, "");

  // re-arm for completion path
  const arm3 = runHook(
    "prompt",
    {
      cwd: root,
      session_id: session,
      prompt: "/goal finish with trailer",
    },
    env,
  );
  assert.match(arm3.stdout, /armed run_id=/);
  const runId = readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim();

  const verify = spawnSync(
    process.execPath,
    [
      LOG_DECISION,
      "--workspace",
      root,
      "--phase",
      "end",
      "--kind",
      "verify",
      "--decision",
      "independent verification passed",
      "--why",
      "fresh evidence",
      "--evidence",
      "tests green",
      "--result",
      "ok",
      "--session-id",
      `${session}-verifier`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(verify.status, 0, verify.stderr);

  // append close via helper
  const close = spawnSync(
    process.execPath,
    [
      LOG_DECISION,
      "--workspace",
      root,
      "--phase",
      "end",
      "--kind",
      "close",
      "--decision",
      "goal complete",
      "--why",
      "verified",
      "--evidence",
      "tests green",
      "--result",
      "ok",
      "--session-id",
      session,
    ],
    { encoding: "utf8" },
  );
  assert.equal(close.status, 0, close.stderr);
  const tip = trailTipSummary(
    join(root, ".goal-task", "runs", runId, "decisions.tsv"),
    runId,
  );
  assert.equal(tip.kind, "close");
  const trailer = formatCompletionTrailer({
    runId,
    closeSeq: tip.closeSeq,
    tipHash: tip.tipHash,
  });

  // fake trailer blocks
  const badStop = runHook(
    "stop",
    {
      cwd: root,
      session_id: session,
      last_assistant_message: `All done.\nGOAL_TASK_DONE run_id=${runId} status=completed close_seq=99 tip_hash=deadbeefdeadbeef\n`,
    },
    env,
  );
  assert.match(badStop.stdout, /"decision":"block"/);

  const goodStop = runHook(
    "stop",
    {
      cwd: root,
      session_id: session,
      last_assistant_message: `All done.\n${trailer}\n`,
    },
    env,
  );
  assert.doesNotMatch(goodStop.stdout, /"decision":"block"/);
  assert.match(goodStop.stdout, /completed/);
  assert.equal(readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim(), "");
});

test("hook: resume ignored while armed", () => {
  const root = workspace();
  const data = workspace();
  const session = "sess-resume";
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  runHook(
    "prompt",
    { cwd: root, session_id: session, prompt: "/goal keep going on X" },
    env,
  );
  const before = readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim();
  const out = runHook(
    "prompt",
    { cwd: root, session_id: session, prompt: "/goal resume" },
    env,
  );
  assert.equal(out.stdout.trim(), "");
  const after = readFileSync(join(root, ".goal-task", "CURRENT"), "utf8").trim();
  assert.equal(after, before);
});

test("looksLikeCompletionClaim", () => {
  assert.equal(looksLikeCompletionClaim("GOAL_TASK_DONE run_id=x status=completed close_seq=1 tip_hash=abcdef12"), true);
  assert.equal(looksLikeCompletionClaim("goal achieved successfully"), true);
  assert.equal(looksLikeCompletionClaim("still working on the migrate"), false);
});

test("resolveConfig tipWindow clamp", () => {
  const c = resolveConfig({ tipWindow: 2 });
  assert.equal(c.tipWindow, 2);
  const c2 = resolveConfig({ tipWindow: 9 });
  assert.equal(c2.tipWindow, 3);
});

test("resolveConfig falls back when auditRoot escapes the repository", () => {
  const warnings = [];

  const config = resolveConfig(
    { auditRoot: "../outside" },
    (warning) => warnings.push(warning),
  );

  assert.equal(config.auditRoot, ".goal-task");
  assert.match(warnings[0], /invalid auditRoot/u);
});

test("auditPaths rejects an unvalidated auditRoot outside the repository", () => {
  assert.throws(
    () => auditPaths("/workspace/repo", "../outside", "run-1"),
    /inside the repository root/u,
  );
});

test("auditPaths and log-decision reject escaped run ids", () => {
  const root = workspace();
  spawnSync("git", ["init", "-q"], { cwd: root });
  const runId = makeRunId();
  createRun(root, {
    auditRoot: ".goal-task",
    runId,
    objective: "demo",
    sessionId: "s-escape",
    host: "test",
    tipWindow: 3,
    writeOpenRow: true,
  });
  assert.throws(
    () => auditPaths(root, ".goal-task", "../../src/pwn"),
    /audit-safe identifier|inside the audit root/u,
  );
  writeFileSync(join(root, ".goal-task", "CURRENT"), "../../src/pwn\n");
  const result = spawnSync(
    process.execPath,
    [
      LOG_DECISION,
      "--workspace",
      root,
      "--phase",
      "p",
      "--kind",
      "implement",
      "--decision",
      "d",
      "--why",
      "w",
      "--evidence",
      "e",
      "--result",
      "ok",
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(root, "src", "pwn")), false);
  assert.equal(existsSync(join(root, "src", "pwn", "decisions.tsv")), false);
});

test("log-decision loads project tipWindow and rejects rewrite past seal", async () => {
  const root = workspace();
  // minimal git root
  spawnSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(
    join(root, ".goal-task-gate.mjs"),
    "export default { tipWindow: 2 };\n",
  );
  const data = workspace();
  const session = "sess-cfg";
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  runHook(
    "prompt",
    { cwd: root, session_id: session, prompt: "/goal with tip 2" },
    env,
  );
  // open row exists; append two more so tipWindow=2 seals first of three
  for (const kind of ["implement", "verify"]) {
    const r = spawnSync(
      process.execPath,
      [
        LOG_DECISION,
        "--workspace",
        root,
        "--phase",
        "p",
        "--kind",
        kind,
        "--decision",
        kind,
        "--why",
        "w",
        "--evidence",
        "e",
        "--result",
        "ok",
        "--session-id",
        session,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  // rewrite-tip 3 must fail when tipWindow is 2
  const bad = spawnSync(
    process.execPath,
    [
      LOG_DECISION,
      "--workspace",
      root,
      "--rewrite-tip",
      "3",
      "--rows-json",
      JSON.stringify([
        {
          phase: "p",
          kind: "checkpoint",
          decision: "x",
          why: "y",
          evidence: "z",
          result: "ok",
        },
      ]),
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /k must be 1\.\.2|tipWindow|1\.\.2/i);
});

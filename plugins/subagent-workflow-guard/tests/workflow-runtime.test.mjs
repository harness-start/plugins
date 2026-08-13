import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(
  new URL("../scripts/subagent-workflow.mjs", import.meta.url),
);
const HOOK = fileURLToPath(
  new URL("../scripts/subagent-workflow-guard.mjs", import.meta.url),
);

function run(entry, args, input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "swg-workspace-"));
  const data = mkdtempSync(join(tmpdir(), "swg-data-"));
  return {
    root,
    env: {
      PLUGIN_DATA: data,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
    },
  };
}

async function openRun(fx, runId = "run-1") {
  return run(CLI, ["run-open", "--host", "codex", "--session", "session-1", "--cwd", fx.root, "--run-id", runId], "", fx.env);
}

async function prepareApplication(fx, application) {
  const path = join(fx.root, `${application.id}.json`);
  writeFileSync(path, JSON.stringify(application));
  const result = await run(CLI, ["prepare", "--host", "codex", "--session", "session-1", "--cwd", fx.root, "--file", path], "", fx.env);
  return { result, receipt: result.stdout ? JSON.parse(result.stdout) : null };
}

function completeCard(parentAction = "None.") {
  return [
    "Status: DONE",
    "## Answer",
    "Completed the scoped task.",
    "## Evidence",
    "tests/workflow-runtime.test.mjs:1 records the requested test output.",
    "## Files/commands inspected",
    "Scoped files and targeted tests.",
    "## Verification",
    "node --test tests/workflow-runtime.test.mjs passed (exit code 0).",
    "## Assumptions",
    "None.",
    "## Gaps",
    "None.",
    "## Parent action needed",
    parentAction,
  ].join("\n");
}

async function dispatchAndComplete(fx, receipt, agentId, toolId) {
  const sessionId = fx.sessionId ?? "session-1";
  const toolInput = { message: receipt.marker };
  const pre = await run(HOOK, ["pre", "codex"], JSON.stringify({ hook_event_name: "PreToolUse", session_id: sessionId, cwd: fx.root, tool_name: "Agent", tool_use_id: toolId, tool_input: toolInput }), fx.env);
  assert.equal(pre.stdout, "", pre.stderr);
  const start = await run(HOOK, ["start", "codex"], JSON.stringify({ hook_event_name: "SubagentStart", session_id: sessionId, cwd: fx.root, agent_id: agentId, agent_prompt: receipt.marker }), fx.env);
  assert.match(JSON.parse(start.stdout).hookSpecificOutput.additionalContext, /Result Card/);
  const stop = await run(HOOK, ["subagent-stop", "codex"], JSON.stringify({ hook_event_name: "SubagentStop", session_id: sessionId, cwd: fx.root, agent_id: agentId, last_assistant_message: completeCard() }), fx.env);
  assert.equal(stop.stdout, "", stop.stderr);
}

test("run-open activates a governed run for the current session", async () => {
  const fx = fixture();
  const opened = await run(
    CLI,
    [
      "run-open",
      "--host",
      "codex",
      "--session",
      "session-1",
      "--cwd",
      fx.root,
      "--run-id",
      "run-1",
    ],
    "",
    fx.env,
  );
  assert.equal(opened.code, 0);
  assert.deepEqual(JSON.parse(opened.stdout), {
    ok: true,
    runId: "run-1",
    phase: "open",
  });

  const denied = await run(
    HOOK,
    ["pre", "codex"],
    JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "session-1",
      cwd: fx.root,
      tool_name: "Agent",
      tool_use_id: "tool-1",
      tool_input: { message: "Implement the task" },
    }),
    fx.env,
  );
  assert.equal(denied.code, 0);
  const output = JSON.parse(denied.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /application/i);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /\[subagent-workflow-guard\] DENY run=run-1 tool=tool-1 reason=missing-application/u);
});

test("an application receipt is single-use and binds the Result Card lifecycle", async () => {
  const fx = fixture();
  await openRun(fx);
  const applicationFile = join(fx.root, "application.json");
  writeFileSync(applicationFile, JSON.stringify({
    id: "impl-1",
    runId: "run-1",
    role: "implementer",
    objective: "Implement the public workflow seam",
    acceptance: ["targeted tests pass"],
    writeScope: ["src/**"],
    requiredEvidence: ["test output"],
  }));
  const prepared = await run(
    CLI,
    ["prepare", "--host", "codex", "--session", "session-1", "--cwd", fx.root, "--file", applicationFile],
    "",
    fx.env,
  );
  assert.equal(prepared.code, 0, prepared.stderr);
  const receipt = JSON.parse(prepared.stdout);
  assert.match(receipt.marker, /^SUBAGENT_APPLICATION impl-1 [a-f0-9]{32}$/u);

  const dispatch = {
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    cwd: fx.root,
    tool_name: "Agent",
    tool_use_id: "tool-1",
    tool_input: { message: receipt.marker, task_name: "implementer" },
  };
  const allowed = await run(HOOK, ["pre", "codex"], JSON.stringify(dispatch), fx.env);
  assert.equal(allowed.stdout, "");
  const replayed = await run(HOOK, ["pre", "codex"], JSON.stringify({ ...dispatch, tool_use_id: "tool-2" }), fx.env);
  assert.equal(JSON.parse(replayed.stdout).hookSpecificOutput.permissionDecision, "deny");

  const started = await run(HOOK, ["start", "codex"], JSON.stringify({
    hook_event_name: "SubagentStart",
    session_id: "session-1",
    cwd: fx.root,
    agent_id: "agent-1",
    agent_type: "worker",
    agent_prompt: receipt.marker,
  }), fx.env);
  const startContext = JSON.parse(started.stdout).hookSpecificOutput.additionalContext;
  assert.match(startContext, /Role: implementer/);
  assert.match(startContext, /Result Card/);

  const outsideWrite = await run(HOOK, ["pre", "codex"], JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    cwd: fx.root,
    agent_id: "agent-1",
    tool_name: "apply_patch",
    tool_input: { patch: "*** Begin Patch\n*** Add File: docs/outside.md\n+x\n*** End Patch" },
  }), fx.env);
  assert.equal(JSON.parse(outsideWrite.stdout).hookSpecificOutput.permissionDecision, "deny");

  const invalidStop = await run(HOOK, ["subagent-stop", "codex"], JSON.stringify({
    hook_event_name: "SubagentStop",
    session_id: "session-1",
    cwd: fx.root,
    agent_id: "agent-1",
    last_assistant_message: "done",
  }), fx.env);
  assert.equal(JSON.parse(invalidStop.stdout).decision, "block");

  const resultCard = completeCard("Dispatch reviewers.");
  const validStop = await run(HOOK, ["subagent-stop", "codex"], JSON.stringify({
    hook_event_name: "SubagentStop",
    session_id: "session-1",
    cwd: fx.root,
    agent_id: "agent-1",
    last_assistant_message: resultCard,
  }), fx.env);
  assert.equal(validStop.stdout, "");

  const parentStop = await run(HOOK, ["stop", "codex"], JSON.stringify({
    hook_event_name: "Stop",
    session_id: "session-1",
    cwd: fx.root,
  }), fx.env);
  assert.equal(JSON.parse(parentStop.stdout).decision, "block");
  assert.match(JSON.parse(parentStop.stdout).reason, /run-close/);
});

test("ordinary dispatch reports while block mode denies without a run", async () => {
  const fx = fixture();
  const event = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "session-1", cwd: fx.root, tool_name: "Agent", tool_input: { message: "Read only" } });
  const reported = await run(HOOK, ["pre", "codex"], event, fx.env);
  const report = JSON.parse(reported.stdout).hookSpecificOutput;
  assert.equal(report.hookEventName, "PreToolUse");
  assert.equal(report.permissionDecision, undefined);

  writeFileSync(join(fx.root, ".subagent-workflow-guard.mjs"), "export default { dispatch: \"block\" };\n");
  const denied = await run(HOOK, ["pre", "codex"], event, fx.env);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("dispatch failure releases a reservation for one safe retry", async () => {
  const fx = fixture();
  await openRun(fx);
  const { receipt } = await prepareApplication(fx, { id: "retry-1", runId: "run-1", role: "implementer", objective: "Retry dispatch", acceptance: ["dispatch starts"], writeScope: ["src/**"] });
  const event = { hook_event_name: "PreToolUse", session_id: "session-1", cwd: fx.root, tool_name: "Agent", tool_use_id: "tool-1", tool_input: { message: receipt.marker } };
  assert.equal((await run(HOOK, ["pre", "codex"], JSON.stringify(event), fx.env)).stdout, "");
  const failed = await run(HOOK, ["failure", "codex"], JSON.stringify({ ...event, hook_event_name: "PostToolUseFailure" }), fx.env);
  assert.equal(JSON.parse(failed.stdout).hookSpecificOutput.hookEventName, "PostToolUseFailure");
  assert.equal((await run(HOOK, ["pre", "codex"], JSON.stringify({ ...event, tool_use_id: "tool-2" }), fx.env)).stdout, "");
});

test("independent reviewers are read-only and a complete review graph closes the run", async () => {
  const fx = fixture();
  await openRun(fx);
  const implementer = await prepareApplication(fx, { id: "impl-graph", runId: "run-1", role: "implementer", objective: "Implement graph", acceptance: ["implementation passes"], writeScope: ["src/**"] });
  await dispatchAndComplete(fx, implementer.receipt, "agent-impl", "tool-impl");

  for (const [role, id] of [["spec-reviewer", "spec-graph"], ["quality-reviewer", "quality-graph"]]) {
    const review = await prepareApplication(fx, { id, runId: "run-1", role, reviewFor: "impl-graph", objective: `Review ${role}`, acceptance: ["findings are anchored"], writeScope: [] });
    assert.equal(review.result.code, 0, review.result.stderr);
    const toolId = `tool-${id}`;
    const agentId = `agent-${id}`;
    const pre = await run(HOOK, ["pre", "codex"], JSON.stringify({ hook_event_name: "PreToolUse", session_id: "session-1", cwd: fx.root, tool_name: "Agent", tool_use_id: toolId, tool_input: { message: review.receipt.marker } }), fx.env);
    assert.equal(pre.stdout, "");
    await run(HOOK, ["start", "codex"], JSON.stringify({ hook_event_name: "SubagentStart", session_id: "session-1", cwd: fx.root, agent_id: agentId, agent_prompt: review.receipt.marker }), fx.env);
    const write = await run(HOOK, ["pre", "codex"], JSON.stringify({ hook_event_name: "PreToolUse", session_id: "session-1", cwd: fx.root, agent_id: agentId, tool_name: "Write", tool_input: { file_path: "review.md", content: "changed" } }), fx.env);
    assert.equal(JSON.parse(write.stdout).hookSpecificOutput.permissionDecision, "deny");
    const shellWrite = await run(HOOK, ["pre", "codex"], JSON.stringify({ hook_event_name: "PreToolUse", session_id: "session-1", cwd: fx.root, agent_id: agentId, tool_name: "exec_command", tool_input: { cmd: "node -e \"require('fs').writeFileSync('outside.txt','x')\"" } }), fx.env);
    assert.equal(JSON.parse(shellWrite.stdout).hookSpecificOutput.permissionDecision, "deny");
    await run(HOOK, ["subagent-stop", "codex"], JSON.stringify({ hook_event_name: "SubagentStop", session_id: "session-1", cwd: fx.root, agent_id: agentId, last_assistant_message: completeCard() }), fx.env);
  }

  const finalReview = await prepareApplication(fx, { id: "final-graph", runId: "run-1", role: "final-reviewer", objective: "Review the integrated result", acceptance: ["complete diff is reviewed"], writeScope: [] });
  await dispatchAndComplete(fx, finalReview.receipt, "agent-final", "tool-final");
  const staleAttempt = await prepareApplication(fx, { id: "late-impl", runId: "run-1", role: "implementer", objective: "Mutate after final review", acceptance: ["late work"], writeScope: ["late/**"] });
  assert.equal(staleAttempt.result.code, 2);
  assert.match(staleAttempt.result.stderr, /sealed|final review/iu);
  const closed = await run(CLI, ["run-close", "--host", "codex", "--session", "session-1", "--cwd", fx.root, "--status", "DONE"], "", fx.env);
  assert.equal(closed.code, 0, closed.stderr);
  assert.equal(JSON.parse(closed.stdout).completion, "DONE");
  const parentStop = await run(HOOK, ["stop", "codex"], JSON.stringify({ hook_event_name: "Stop", session_id: "session-1", cwd: fx.root }), fx.env);
  assert.equal(parentStop.stdout, "");
});

test("Codex CLI mailbox bridges missing interactive plugin and session variables", async () => {
  const fx = fixture();
  execFileSync("git", ["init", "-q"], { cwd: fx.root });
  const interactiveEnv = { PLUGIN_DATA: "", AI_EXPERTS_SESSION_ID: "", CODEX_HOME: "", CODEX_THREAD_ID: "session-mailbox" };
  const opened = await run(CLI, ["run-open", "--host", "codex", "--cwd", fx.root, "--run-id", "mailbox-run"], "", interactiveEnv);
  assert.equal(opened.code, 0, opened.stderr);
  assert.equal(JSON.parse(opened.stdout).phase, "requested");

  const unrelated = await run(HOOK, ["pre", "codex"], JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "another-session",
    cwd: fx.root,
    tool_name: "Agent",
    tool_use_id: "unrelated-tool",
    tool_input: { message: "Unrelated session dispatch" },
  }), { ...fx.env, AI_EXPERTS_SESSION_ID: "another-session" });
  assert.equal(JSON.parse(unrelated.stdout).hookSpecificOutput.permissionDecision, undefined);

  const denied = await run(HOOK, ["pre", "codex"], JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "session-mailbox",
    cwd: fx.root,
    tool_name: "Agent",
    tool_use_id: "mailbox-tool",
    tool_input: { message: "Dispatch without an application" },
  }), { ...fx.env, AI_EXPERTS_SESSION_ID: "session-mailbox" });
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.stderr, /run=mailbox-run.*reason=missing-application/u);

  const applicationPath = join(fx.root, "mailbox-application.json");
  writeFileSync(applicationPath, JSON.stringify({
    id: "mailbox-impl",
    runId: "mailbox-run",
    role: "implementer",
    objective: "Exercise mailbox application import",
    acceptance: ["application binds"],
    writeScope: ["src/**"],
  }));
  const prepared = await run(CLI, ["prepare", "--host", "codex", "--cwd", fx.root, "--file", applicationPath], "", interactiveEnv);
  assert.equal(prepared.code, 0, prepared.stderr);
  const receipt = JSON.parse(prepared.stdout);
  assert.equal(receipt.phase, "requested");
  await dispatchAndComplete({ ...fx, sessionId: "session-mailbox", env: { ...fx.env, AI_EXPERTS_SESSION_ID: "session-mailbox" } }, receipt, "mailbox-agent", "mailbox-dispatch");

  const closeRequested = await run(CLI, ["run-close", "--host", "codex", "--cwd", fx.root, "--status", "BLOCKED"], "", interactiveEnv);
  assert.equal(closeRequested.code, 0, closeRequested.stderr);
  assert.equal(JSON.parse(closeRequested.stdout).phase, "close-requested");
  const stopped = await run(HOOK, ["stop", "codex"], JSON.stringify({
    hook_event_name: "Stop",
    session_id: "session-mailbox",
    cwd: fx.root,
  }), { ...fx.env, AI_EXPERTS_SESSION_ID: "session-mailbox" });
  assert.equal(stopped.stdout, "", stopped.stderr);
  const inspected = await run(CLI, ["inspect", "--host", "codex", "--session", "session-mailbox", "--cwd", fx.root], "", { ...fx.env, AI_EXPERTS_SESSION_ID: "session-mailbox" });
  assert.equal(JSON.parse(inspected.stdout).run.phase, "closed");
});

test("offline mailbox commands require an explicit platform session identity", async () => {
  const fx = fixture();
  execFileSync("git", ["init", "-q"], { cwd: fx.root });
  const result = await run(
    CLI,
    ["run-open", "--host", "codex", "--cwd", fx.root, "--run-id", "missing-session"],
    "",
    {
      PLUGIN_DATA: "",
      AI_EXPERTS_SESSION_ID: "",
      CODEX_THREAD_ID: "",
      CLAUDE_SESSION_ID: "",
    },
  );
  assert.equal(result.code, 2);
  assert.match(result.stderr, /session.*required/iu);
});

test("implicit platform sessions use the mailbox even when shell plugin data is present", async () => {
  const fx = fixture();
  execFileSync("git", ["init", "-q"], { cwd: fx.root });
  const result = await run(
    CLI,
    ["run-open", "--host", "codex", "--cwd", fx.root, "--run-id", "implicit-session"],
    "",
    { ...fx.env, AI_EXPERTS_SESSION_ID: "implicit-session-id" },
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).phase, "requested");
});

test("persisted platform host is authoritative for workflow CLI commands", async () => {
  const fx = fixture();
  execFileSync("git", ["init", "-q"], { cwd: fx.root });
  const platformEnv = {
    ...fx.env,
    AI_EXPERTS_SESSION_ID: "host-bound-session",
    SUBAGENT_WORKFLOW_GUARD_HOST: "claude",
    CLAUDE_PLUGIN_DATA: fx.env.PLUGIN_DATA,
  };
  const inferred = await run(CLI, ["run-open", "--cwd", fx.root, "--run-id", "host-bound-run"], "", platformEnv);
  assert.equal(inferred.code, 0, inferred.stderr);
  assert.equal(JSON.parse(inferred.stdout).phase, "requested");

  const mismatch = await run(CLI, ["inspect", "--host", "codex", "--cwd", fx.root], "", platformEnv);
  assert.equal(mismatch.code, 2);
  assert.match(mismatch.stderr, /host.*conflict/iu);
});

test("a corrupt Git mailbox fails closed at the dispatch seam", async () => {
  const fx = fixture();
  execFileSync("git", ["init", "-q"], { cwd: fx.root });
  const sessionKey = createHash("sha256").update("corrupt-session").digest("hex");
  const mailbox = join(fx.root, ".git", "ai-experts", "subagent-workflow-guard", "codex", sessionKey);
  mkdirSync(mailbox, { recursive: true });
  const active = await run(CLI, ["run-open", "--host", "codex", "--session", "corrupt-session", "--cwd", fx.root, "--run-id", "active-corrupt"], "", fx.env);
  assert.equal(active.code, 0, active.stderr);
  writeFileSync(join(mailbox, "run.json"), "{not-json\n");
  const result = await run(HOOK, ["pre", "codex"], JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "corrupt-session",
    cwd: fx.root,
    tool_name: "Agent",
    tool_use_id: "corrupt-tool",
    tool_input: { message: "attempt dispatch" },
  }), { ...fx.env, AI_EXPERTS_SESSION_ID: "corrupt-session" });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /mailbox|JSON|position/iu);

  const stop = await run(HOOK, ["stop", "codex"], JSON.stringify({
    hook_event_name: "Stop",
    session_id: "corrupt-session",
    cwd: fx.root,
  }), { ...fx.env, AI_EXPERTS_SESSION_ID: "corrupt-session" });
  assert.equal(JSON.parse(stop.stdout).decision, "block");
  assert.match(JSON.parse(stop.stdout).reason, /mailbox.*unreadable/iu);

  const invalidSessionKey = createHash("sha256").update("invalid-schema-session").digest("hex");
  const invalidMailbox = join(fx.root, ".git", "ai-experts", "subagent-workflow-guard", "codex", invalidSessionKey);
  mkdirSync(invalidMailbox, { recursive: true });
  writeFileSync(join(invalidMailbox, "run.json"), JSON.stringify({ version: 99, sessionId: "invalid-schema-session", runId: "../escape", phase: "requested" }));
  const invalidSchema = await run(HOOK, ["pre", "codex"], JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "invalid-schema-session",
    cwd: fx.root,
    tool_name: "Agent",
    tool_use_id: "invalid-schema-tool",
    tool_input: { message: "attempt dispatch" },
  }), { ...fx.env, AI_EXPERTS_SESSION_ID: "invalid-schema-session" });
  assert.equal(JSON.parse(invalidSchema.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(JSON.parse(invalidSchema.stdout).hookSpecificOutput.permissionDecisionReason, /mailbox.*invalid/iu);
});

test("corrupt durable state fails closed for Agent dispatch and parent Stop", async () => {
  const fx = fixture();
  const opened = await run(CLI, ["run-open", "--host", "codex", "--session", "corrupt-state-session", "--cwd", fx.root, "--run-id", "corrupt-state-run"], "", fx.env);
  assert.equal(opened.code, 0, opened.stderr);
  const stateKey = createHash("sha256").update(`corrupt-state-session\0${fx.root}`).digest("hex");
  const statePath = join(fx.root, ".subagent-workflow", ".state", "codex", "sessions", `${stateKey}.json`);
  writeFileSync(statePath, "{broken-state\n");

  const dispatch = await run(HOOK, ["pre", "codex"], JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "corrupt-state-session",
    cwd: fx.root,
    tool_name: "Agent",
    tool_use_id: "corrupt-state-tool",
    tool_input: { message: "attempt dispatch" },
  }), fx.env);
  assert.equal(JSON.parse(dispatch.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(JSON.parse(dispatch.stdout).hookSpecificOutput.permissionDecisionReason, /state.*unreadable/iu);

  const stop = await run(HOOK, ["stop", "codex"], JSON.stringify({
    hook_event_name: "Stop",
    session_id: "corrupt-state-session",
    cwd: fx.root,
  }), fx.env);
  assert.equal(JSON.parse(stop.stdout).decision, "block");
  assert.match(JSON.parse(stop.stdout).reason, /state|mailbox.*unreadable/iu);
});

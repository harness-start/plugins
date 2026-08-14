import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ResearchService } from "../server/lib/research-service.mjs";
import { evaluateStop } from "../scripts/research-provenance-guard.mjs";
import { appendStateEvent, readState } from "../scripts/lib/state-store.mjs";
import { defaultWorkflow, ensureRunSkeleton, readWorkflowFile, workflowPath, writeWorkflow } from "../scripts/lib/workflow-fs.mjs";

async function fixture(session = "hook-session") {
  const root = await mkdtemp(join(tmpdir(), "research-hook-"));
  const workspace = join(root, "workspace");
  const dataRoot = join(root, "data");
  await mkdir(workspace);
  await writeFile(join(workspace, "source.md"), "Supported fact.\n", "utf8");
  process.env.RESEARCH_PLUGIN_DATA = dataRoot;
  return { workspace, dataRoot, event: { session_id: session, cwd: workspace } };
}

function openWorkflow(workspace, runId = "r-20260808120000-abcdef") {
  ensureRunSkeleton(workspace, runId);
  writeWorkflow(workspace, defaultWorkflow({ runId, question: "Q", scope: "S", asOf: "2026-08-08", promptEpoch: 1 }));
  return runId;
}

function runHook(mode, event, dataRoot) {
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  return spawnSync(process.execPath, [script, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_ROOT: pluginRoot, RESEARCH_PLUGIN_DATA: dataRoot },
  });
}

test("ordinary non-research completion bypasses the gate", async () => {
  const { event } = await fixture("bypass");
  const result = await evaluateStop({ ...event, last_assistant_message: "A normal answer." });
  assert.equal(result.allow, true);
});

test("skill name in prompt does not activate hard mode", async () => {
  const { workspace, dataRoot, event } = await fixture("skill-name");
  appendStateEvent(event, "prompt", { abort: false });
  const result = runHook("prompt", { ...event, prompt: "Tell me about research-evidence-workflow casually" }, dataRoot);
  assert.equal(result.status, 0);
  assert.equal(readState(event).active, false);
  assert.equal(workspace, event.cwd);
});

test("SessionStart injects orchestrator routing priority", async () => {
  const { dataRoot, event } = await fixture("session");
  const result = runHook("session", event, dataRoot);
  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.match(body.hookSpecificOutput.additionalContext, /research-evidence-workflow/u);
  assert.match(body.hookSpecificOutput.additionalContext, /standalone firecrawl or research/iu);
  assert.match(body.hookSpecificOutput.additionalContext, /arxiv-search/iu);
});

test("open project workflow activates gate without prompt aliases", async () => {
  const { workspace, dataRoot, event } = await fixture("workflow-active");
  openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  assert.equal(readState(event).active, true);
  assert.equal((await evaluateStop({ ...event, last_assistant_message: "Done." })).allow, false);
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "workflow-active" });
  const begun = await service.call("research_begin", { question: "Q", scope: "fixture", as_of: "2026-08-08", prompt_epoch: 1 });
  const captured = await service.call("source_capture", { kind: "workspace", path: "source.md" });
  const anchor = await service.call("source_anchor", { source_id: captured.source_id, kind: "line_range", start_line: 1, end_line: 1 });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "anchored", text: "Supported fact.", anchor_ids: [anchor.anchor_id] }],
  });
  appendStateEvent(event, "receipt", { tool: "research_seal", runId: begun.run_id, seal: sealed.seal, promptEpoch: 1, revision: 0 });
  assert.equal((await evaluateStop({ ...event, last_assistant_message: sealed.trailer })).allow, true);
  const normalResponse = await evaluateStop({ ...event, last_assistant_message: `Implemented and verified the requested change.\n\n${sealed.trailer}` });
  assert.equal(normalResponse.allow, true, normalResponse.findings?.join("; "));
});

test("active pre-tool policy blocks direct Firecrawl and seal writes", async () => {
  const { workspace, dataRoot, event } = await fixture("pre");
  openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  for (const toolEvent of [
    { ...event, tool_name: "exec_command", tool_input: { cmd: "npx firecrawl search cats" } },
    { ...event, tool_name: "exec_command", tool_input: { cmd: "npx -y firecrawl search cats" } },
    { ...event, tool_name: "exec_command", tool_input: { cmd: "/usr/local/bin/firecrawl search cats" } },
    { ...event, tool_name: "apply_patch", tool_input: { patch: "*** Add File: .research/runs/r-1/research.json" } },
    { ...event, tool_name: "Write", tool_input: { file_path: ".research/runs/r-20260808120000-abcdef/workflow.json", content: "{\"phase\":\"complete\"}" } },
    { ...event, tool_name: "exec_command", tool_input: { cmd: "rm -rf .research/runs/r-20260808120000-abcdef" } },
  ]) {
    const result = runHook("pre", toolEvent, dataRoot);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).decision, "block");
  }
});

test("shell redirection after activation advances the mutation revision", async () => {
  const { workspace, dataRoot, event } = await fixture("shell-redirection");
  openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  const result = runHook("post", {
    ...event,
    tool_name: "exec_command",
    tool_input: { cmd: "echo changed > notes.md" },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.equal(readState(event).revision, 1);
});

test("read-only inspection commands do not stale research state", async () => {
  const { workspace, dataRoot, event } = await fixture("readonly-inspection");
  const runId = openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  appendStateEvent(event, "receipt", { tool: "research_begin", runId, promptEpoch: 1, revision: 0 });
  const result = runHook("post", {
    ...event,
    tool_name: "exec_command",
    tool_input: { cmd: `jq . .research/runs/${runId}/workflow.json` },
    tool_response: { exit_code: 0, stdout: "{}" },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.equal(readState(event).revision, 0);
});

test("unrelated implementation mutations after seal do not invalidate immutable research evidence", async () => {
  const { workspace, dataRoot, event } = await fixture("post-seal-implementation");
  const runId = openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "post-seal-implementation" });
  const begun = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1, run_id: runId });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "unverified", text: "Unknown", limitation: "No source was supplied." }],
  });
  appendStateEvent(event, "receipt", { tool: "research_begin", runId, promptEpoch: 1, revision: 0 });
  appendStateEvent(event, "receipt", { tool: "research_seal", runId, seal: sealed.seal, promptEpoch: 1, revision: 0 });
  const mutation = runHook("post", {
    ...event,
    tool_name: "Write",
    tool_input: { file_path: "src/implementation.js", content: "export const value = 1;\n" },
  }, dataRoot);
  assert.equal(mutation.status, 0);
  assert.equal(readState(event).revision, 0);
  assert.equal(readState(event).seal?.seal, sealed.seal);
  const stop = await evaluateStop({ ...event, last_assistant_message: `Done.\n\n${sealed.trailer}` });
  assert.equal(stop.allow, true, stop.findings?.join("; "));
});

test("a later research_begin clears an earlier run seal", async () => {
  const { event } = await fixture("seal-binding");
  appendStateEvent(event, "prompt", { abort: false });
  appendStateEvent(event, "receipt", { tool: "research_begin", runId: "r-20260808120000-first", promptEpoch: 1, revision: 0 });
  appendStateEvent(event, "receipt", { tool: "research_seal", runId: "r-20260808120000-first", seal: `sha256:${"a".repeat(64)}`, promptEpoch: 1, revision: 0 });
  appendStateEvent(event, "receipt", { tool: "research_begin", runId: "r-20260808120000-second", promptEpoch: 1, revision: 0 });
  const state = readState(event);
  assert.equal(state.runId, "r-20260808120000-second");
  assert.equal(state.seal, null);
  assert.equal(state.active, true);
});

test("only the exact abort prompt terminalizes an active workflow", async () => {
  const { workspace, dataRoot, event } = await fixture("prompt-abort");
  const runId = openWorkflow(workspace);
  const result = runHook("prompt", { ...event, prompt: "# research-abort" }, dataRoot);
  assert.equal(result.status, 0);
  assert.equal(readWorkflowFile(workflowPath(workspace, runId)).phase, "aborted");
  assert.equal(readState(event).active, false);
});

test("a successful Stop terminalizes the workflow and releases later answers", async () => {
  const { workspace, dataRoot, event } = await fixture("stop-complete");
  const runId = openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "stop-complete" });
  const begun = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1, run_id: runId });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "unverified", text: "Unknown", limitation: "No source was supplied." }],
  });
  appendStateEvent(event, "receipt", { tool: "research_begin", runId, promptEpoch: 1, revision: 0 });
  appendStateEvent(event, "receipt", { tool: "research_seal", runId, seal: sealed.seal, promptEpoch: 1, revision: 0 });
  assert.equal(readState(event).active, true);

  const result = runHook("stop", { ...event, last_assistant_message: sealed.trailer }, dataRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(readWorkflowFile(workflowPath(workspace, runId)).phase, "complete");
  assert.equal(readState(event).active, false);
  assert.equal((await evaluateStop({ ...event, last_assistant_message: "ordinary follow-up" })).allow, true);
});

test("outbound handoff writes blocked until sealed", async () => {
  const { workspace, dataRoot, event } = await fixture("outbound");
  openWorkflow(workspace, "r-20260808120000-outbnd1");
  appendStateEvent(event, "prompt", { abort: false });
  const result = runHook("pre", {
    ...event,
    tool_name: "Write",
    tool_input: { file_path: ".research/runs/r-20260808120000-outbnd1/handoffs/outbound/handoff.md", content: "early" },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).reason, /Outbound handoff/u);
});

test("sealed evidence remains reusable across outbound and implementation mutations", async () => {
  const { workspace, dataRoot, event } = await fixture("sealed-outbound");
  const runId = openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "sealed-outbound" });
  const begun = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1, run_id: runId });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "unverified", text: "Unknown", limitation: "No source was supplied." }],
  });
  appendStateEvent(event, "receipt", { tool: "research_begin", runId, promptEpoch: 1, revision: 0 });
  appendStateEvent(event, "receipt", { tool: "research_seal", runId, seal: sealed.seal, promptEpoch: 1, revision: 0 });
  assert.equal(readState(event).active, true);

  const direct = runHook("pre", {
    ...event,
    tool_name: "Write",
    tool_input: { file_path: `.research/runs/${runId}/handoffs/outbound/handoff.md`, content: "direct" },
  }, dataRoot);
  assert.equal(JSON.parse(direct.stdout).decision, "block");

  const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const lifecycle = runHook("post", {
    ...event,
    tool_name: "exec_command",
    tool_input: { cmd: `node "${pluginRoot}/scripts/research-workflow.mjs" handoff-outbound --cwd "${workspace}" --handoff-file /tmp/h --prompt-file /tmp/p` },
  }, dataRoot);
  assert.equal(lifecycle.status, 0);
  assert.equal(readState(event).revision, 0);
  assert.equal(readState(event).seal?.seal, sealed.seal);

  const chained = runHook("post", {
    ...event,
    tool_name: "exec_command",
    tool_input: { cmd: `node "${pluginRoot}/scripts/research-workflow.mjs" handoff-outbound --cwd "${workspace}" --handoff-file /tmp/h --prompt-file /tmp/p; echo changed > notes.md` },
  }, dataRoot);
  assert.equal(chained.status, 0);
  assert.equal(readState(event).revision, 0);
  assert.equal(readState(event).seal?.seal, sealed.seal);
});

test("active pre-tool policy allows orchestration path writes", async () => {
  const { workspace, dataRoot, event } = await fixture("pre-orch");
  openWorkflow(workspace, "r-20260808120000-orch001");
  appendStateEvent(event, "prompt", { abort: false });
  const result = runHook("pre", {
    ...event,
    tool_name: "Write",
    tool_input: { file_path: ".research/runs/r-20260808120000-orch001/brief.md", content: "# brief\n" },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("research_begin enforces the exact epoch", async () => {
  const { dataRoot, event } = await fixture("begin-trigger");
  appendStateEvent(event, "prompt", { abort: false });
  const result = runHook("pre", {
    ...event,
    tool_name: "mcp__research_provenance__research_begin",
    tool_input: { prompt_epoch: 0 },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).reason, /prompt_epoch=1/u);
});

test("research_begin preflight persists without PLUGIN_DATA", async () => {
  const root = await mkdtemp(join(tmpdir(), "research-no-data-"));
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const env = { ...process.env, AI_EXPERTS_SESSION_ID: "missing-data" };
  delete env.PLUGIN_DATA;
  delete env.CLAUDE_PLUGIN_DATA;
  delete env.RESEARCH_PLUGIN_DATA;
  const result = spawnSync(process.execPath, [script, "pre"], {
    input: JSON.stringify({
      session_id: "missing-data",
      cwd: root,
      tool_name: "mcp__research_provenance__research_begin",
      tool_input: { prompt_epoch: 0 },
    }),
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
  assert.equal((await import("node:fs")).existsSync(join(root, ".research", ".state")), true);
});

test("research_seal preflight rejects a stale mutation revision", async () => {
  const { workspace, dataRoot, event } = await fixture("seal-preflight");
  openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  appendStateEvent(event, "mutation", { tool: "apply_patch" });
  const result = runHook("pre", {
    ...event,
    tool_name: "mcp__research_provenance__research_seal",
    tool_input: { prompt_epoch: 1, mutation_revision: 0 },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).reason, /mutation_revision=1/u);
});

test("Claude plugin-prefixed MCP tool names are recognized and receipts persist", async () => {
  const { workspace, dataRoot, event } = await fixture("claude-prefix");
  openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  const result = runHook("post", {
    ...event,
    tool_name: "mcp__plugin_research-provenance-guard_research_provenance__research_seal",
    tool_response: { structuredContent: { event_id: "E000004", run_id: "r-20260808120000-abcdef", seal: `sha256:${"a".repeat(64)}` } },
  }, dataRoot);
  assert.equal(result.status, 0);
  assert.equal(readState(event).seal?.eventId, "E000004");
});

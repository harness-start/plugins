import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ResearchService } from "../server/lib/research-service.mjs";
import { evaluateStop } from "../scripts/research-provenance-guard.mjs";
import { appendStateEvent, readState } from "../scripts/lib/state-store.mjs";
import { defaultWorkflow, ensureRunSkeleton, writeWorkflow } from "../scripts/lib/workflow-fs.mjs";

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
  return spawnSync(process.execPath, [script, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, RESEARCH_PLUGIN_DATA: dataRoot },
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
  const freeProse = await evaluateStop({ ...event, last_assistant_message: `Unsupported summary.\n\n${sealed.trailer}` });
  assert.equal(freeProse.allow, false);
});

test("active pre-tool policy blocks direct Firecrawl and seal writes", async () => {
  const { workspace, dataRoot, event } = await fixture("pre");
  openWorkflow(workspace);
  appendStateEvent(event, "prompt", { abort: false });
  for (const toolEvent of [
    { ...event, tool_name: "exec_command", tool_input: { cmd: "npx firecrawl search cats" } },
    { ...event, tool_name: "apply_patch", tool_input: { patch: "*** Add File: .research/runs/r-1/research.json" } },
  ]) {
    const result = runHook("pre", toolEvent, dataRoot);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).decision, "block");
  }
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

test("research_begin preflight fails closed without plugin data", async () => {
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
  assert.equal(JSON.parse(result.stdout).decision, "block");
  assert.match(JSON.parse(result.stdout).reason, /plugin data/u);
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

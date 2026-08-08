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

async function fixture(session = "hook-session") {
  const root = await mkdtemp(join(tmpdir(), "research-hook-"));
  const workspace = join(root, "workspace");
  const dataRoot = join(root, "data");
  await mkdir(workspace);
  await writeFile(join(workspace, "source.md"), "Supported fact.\n", "utf8");
  process.env.RESEARCH_PLUGIN_DATA = dataRoot;
  return { workspace, dataRoot, event: { session_id: session, cwd: workspace } };
}

test("ordinary non-research completion bypasses the gate", async () => {
  const { event } = await fixture("bypass");
  const result = await evaluateStop({ ...event, last_assistant_message: "A normal answer." });
  assert.equal(result.allow, true);
});

test("active run blocks missing evidence and accepts only its observed fresh seal", async () => {
  const { workspace, dataRoot, event } = await fixture("seal");
  appendStateEvent(event, "prompt", { activate: true, abort: false });
  assert.equal((await evaluateStop({ ...event, last_assistant_message: "Done." })).allow, false);
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "seal" });
  const begun = await service.call("research_begin", { question: "Q", scope: "fixture", as_of: "2026-08-08", prompt_epoch: 1 });
  const captured = await service.call("source_capture", { kind: "workspace", path: "source.md" });
  const anchor = await service.call("source_anchor", { source_id: captured.source_id, kind: "line_range", start_line: 1, end_line: 1 });
  const sealed = await service.call("research_seal", { run_id: begun.run_id, prompt_epoch: 1, mutation_revision: 0, claims: [{ id: "C1", status: "anchored", text: "Supported fact.", anchor_ids: [anchor.anchor_id] }] });
  appendStateEvent(event, "receipt", { tool: "research_seal", runId: begun.run_id, seal: sealed.seal, promptEpoch: 1, revision: 0 });
  assert.equal((await evaluateStop({ ...event, last_assistant_message: sealed.trailer })).allow, true);
  const freeProse = await evaluateStop({ ...event, last_assistant_message: `Unsupported summary.\n\n${sealed.trailer}` });
  assert.equal(freeProse.allow, false);
  assert.ok(freeProse.findings.some((finding) => finding.includes("free-form prose")));
  appendStateEvent(event, "mutation", { tool: "apply_patch" });
  const stale = await evaluateStop({ ...event, last_assistant_message: sealed.trailer });
  assert.equal(stale.allow, false);
  assert.ok(stale.findings.some((finding) => finding.includes("no successful research_seal") || finding.includes("stale")));
});

test("active pre-tool policy blocks direct Firecrawl and .research writes", async () => {
  const { workspace, dataRoot, event } = await fixture("pre");
  appendStateEvent(event, "prompt", { activate: true, abort: false });
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  for (const toolEvent of [
    { ...event, tool_name: "exec_command", tool_input: { cmd: "npx firecrawl search cats" } },
    { ...event, tool_name: "apply_patch", tool_input: { patch: "*** Add File: .research/fake.json" } },
  ]) {
    const result = spawnSync(process.execPath, [script, "pre"], { input: JSON.stringify(toolEvent), encoding: "utf8", env: { ...process.env, RESEARCH_PLUGIN_DATA: dataRoot } });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).decision, "block");
  }
  assert.equal(readState(event).active, true);
});

test("active pre-tool policy allows read-only inspection of canonical research artifacts", async () => {
  const { workspace, dataRoot, event } = await fixture("pre-read");
  appendStateEvent(event, "prompt", { activate: true, abort: false });
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "pre"], {
    input: JSON.stringify({ ...event, tool_name: "exec_command", tool_input: { cmd: "sed -n '1,20p' .research/runs/r-1/report.md" } }),
    encoding: "utf8",
    env: { ...process.env, RESEARCH_PLUGIN_DATA: dataRoot },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(workspace, event.cwd);
});

test("research_begin as the first trigger enforces the exact epoch", async () => {
  const { dataRoot, event } = await fixture("begin-trigger");
  appendStateEvent(event, "prompt", { activate: false, abort: false });
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "pre"], {
    input: JSON.stringify({ ...event, tool_name: "mcp__research_provenance__research_begin", tool_input: { prompt_epoch: 0 } }),
    encoding: "utf8",
    env: { ...process.env, RESEARCH_PLUGIN_DATA: dataRoot },
  });
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).reason, /prompt_epoch=1/u);
  assert.equal(readState(event).active, true);
});

test("explicit activation fails closed when platform plugin data is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "research-no-data-"));
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const env = { ...process.env, AI_EXPERTS_SESSION_ID: "missing-data" };
  delete env.PLUGIN_DATA;
  delete env.CLAUDE_PLUGIN_DATA;
  delete env.RESEARCH_PLUGIN_DATA;
  for (const [mode, event] of [
    ["prompt", { session_id: "missing-data", cwd: root, prompt: "$research Q" }],
    ["pre", { session_id: "missing-data", cwd: root, tool_name: "mcp__research_provenance__research_begin", tool_input: { prompt_epoch: 0 } }],
  ]) {
    const result = spawnSync(process.execPath, [script, mode], { input: JSON.stringify(event), encoding: "utf8", env });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).decision, "block");
    assert.match(JSON.parse(result.stdout).reason, /plugin data/u);
  }
});

test("research_seal preflight rejects a stale mutation revision", async () => {
  const { dataRoot, event } = await fixture("seal-preflight");
  appendStateEvent(event, "prompt", { activate: true, abort: false });
  appendStateEvent(event, "mutation", { tool: "apply_patch" });
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "pre"], {
    input: JSON.stringify({ ...event, tool_name: "mcp__research_provenance__research_seal", tool_input: { prompt_epoch: 1, mutation_revision: 0 } }),
    encoding: "utf8",
    env: { ...process.env, RESEARCH_PLUGIN_DATA: dataRoot },
  });
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).reason, /mutation_revision=1/u);
});

test("Claude plugin-prefixed MCP tool names are recognized and receipts persist", async () => {
  const { dataRoot, event } = await fixture("claude-prefix");
  appendStateEvent(event, "prompt", { activate: true, abort: false });
  const script = fileURLToPath(new URL("../scripts/research-provenance-guard.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "post"], {
    input: JSON.stringify({
      ...event,
      tool_name: "mcp__plugin_research-provenance-guard_research_provenance__research_seal",
      tool_response: { structuredContent: { event_id: "E000004", run_id: "r-20260808120000-abcdef", seal: `sha256:${"a".repeat(64)}` } },
    }),
    encoding: "utf8",
    env: { ...process.env, RESEARCH_PLUGIN_DATA: dataRoot },
  });
  assert.equal(result.status, 0);
  assert.equal(readState(event).seal?.eventId, "E000004");
});

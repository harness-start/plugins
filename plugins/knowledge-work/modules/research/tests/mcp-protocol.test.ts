import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Codex bundled MCP config uses a supported direct server map", async () => {
  const path = fileURLToPath(new URL("../../../mcp/codex.json", import.meta.url));
  const config = JSON.parse(await readFile(path, "utf8"));
  assert.equal(config.mcpServers, undefined);
  assert.equal(config.research_provenance.command, "node");
  assert.deepEqual(config.research_provenance.args, ["./modules/research/dist/mcp/research-provenance-server.mjs"]);
  assert.equal(config.research_provenance.env.RESEARCH_PROVENANCE_HOST, "codex");
  assert.ok(config.research_provenance.env_vars.includes("PWD"));

  const models = JSON.parse(await readFile(fileURLToPath(new URL("../../../../../docker/host-acceptance/models.json", import.meta.url)), "utf8"));
  assert.equal(models.models.find((model) => model.slug === "deepseek-v4-flash").supports_search_tool, false);
});

test("Claude MCP config inherits the platform plugin-data directory", async () => {
  const path = fileURLToPath(new URL("../../../.mcp.json", import.meta.url));
  const config = JSON.parse(await readFile(path, "utf8"));
  const server = config.mcpServers.research_provenance;
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, ["${CLAUDE_PLUGIN_ROOT}/modules/research/dist/mcp/research-provenance-server.mjs"]);
  assert.equal(server.env, undefined, "self-referential env values remain literal and create workspace artifacts");
});

test("stdio MCP exposes six evidence tools without a provider-specific discovery tool", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "research-mcp-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  await writeFile(join(workspace, "fixture.md"), "evidence\n", "utf8");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../dist/mcp/research-provenance-server.mjs", import.meta.url))], {
    env: { ...process.env, RESEARCH_PLUGIN_DATA: join(root, "data"), AI_EXPERTS_SESSION_ID: "protocol-test" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  context.after(() => child.kill());
  const reader = createInterface({ input: child.stdout });
  const messages = [];
  reader.on("line", (line) => messages.push(JSON.parse(line)));
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const take = async (predicate) => {
    for (let retry = 0; retry < 100; retry += 1) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
    throw new Error("timed out waiting for MCP response");
  };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  const initialized = await take((message) => message.id === 1);
  assert.equal(initialized.result.serverInfo.name, "research_provenance");
  assert.equal(initialized.result.serverInfo.version, "0.3.0");
  assert.match(initialized.result.instructions, /registered namespaced research_provenance tools/u);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const listed = await take((message) => message.id === 2);
  assert.equal(listed.result.tools.length, 6);
  assert.equal(listed.result.tools.some((tool) => tool.name === "source_discover"), false);
  const sealTool = listed.result.tools.find((tool) => tool.name === "research_seal");
  assert.deepEqual(sealTool.inputSchema.properties.claims.items.properties.status.enum, ["anchored", "multi_anchored", "inferred", "contested", "unverified"]);
  send({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "source_read", arguments: { source_id: "S999" } } });
  const premature = await take((message) => message.id === 20 || message.method === "roots/list");
  if (premature.method === "roots/list") {
    send({ jsonrpc: "2.0", id: premature.id, result: { roots: [{ uri: new URL(`file://${workspace}`).href, name: "fixture" }] } });
    const failed = await take((message) => message.id === 20);
    assert.equal(failed.result.isError, true);
  }
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "research_begin", arguments: { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 } } });
  const begun = await take((message) => message.id === 3);
  assert.match(begun.result.structuredContent.run_id, /^r-/u);
});

test("Codex MCP falls back to the explicitly forwarded launch workspace when roots are empty", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "research-mcp-codex-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const child = spawn(process.execPath, [fileURLToPath(new URL("../dist/mcp/research-provenance-server.mjs", import.meta.url))], {
    env: {
      ...process.env,
      PLUGIN_DATA: join(root, "data"),
      PWD: workspace,
      RESEARCH_PROVENANCE_HOST: "codex",
      AI_EXPERTS_SESSION_ID: "codex-protocol-test",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  context.after(() => child.kill());
  const reader = createInterface({ input: child.stdout });
  const messages = [];
  reader.on("line", (line) => messages.push(JSON.parse(line)));
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const take = async (predicate) => {
    for (let retry = 0; retry < 100; retry += 1) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
    throw new Error("timed out waiting for MCP response");
  };

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "codex", version: "test" } } });
  await take((message) => message.id === 1);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "research_begin", arguments: { question: "Q", scope: "S", as_of: "2026-08-09", prompt_epoch: 1 } } });
  const ambiguousRoots = await take((message) => message.method === "roots/list");
  const rootUri = new URL(`file://${workspace}`).href;
  send({ jsonrpc: "2.0", id: ambiguousRoots.id, result: { roots: [{ uri: rootUri }, { uri: rootUri }] } });
  const rejected = await take((message) => message.id === 2);
  assert.equal(rejected.result.isError, true);

  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "research_begin", arguments: { question: "Q", scope: "S", as_of: "2026-08-09", prompt_epoch: 1 } } });
  const emptyRoots = await take((message) => message.method === "roots/list");
  send({ jsonrpc: "2.0", id: emptyRoots.id, result: { roots: [] } });
  const begun = await take((message) => message.id === 3);
  assert.equal(begun.result.isError, false);
  assert.match(begun.result.structuredContent.run_id, /^r-/u);
  assert.equal(begun.result.structuredContent.workflow_path.startsWith(".research/runs/"), true);
});

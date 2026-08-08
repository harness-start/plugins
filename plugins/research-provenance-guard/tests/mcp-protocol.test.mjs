import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("stdio MCP exposes seven tools and binds research_begin through roots/list", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "research-mcp-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  await writeFile(join(workspace, "fixture.md"), "evidence\n", "utf8");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../server/research-provenance-server.mjs", import.meta.url))], {
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
  assert.equal((await take((message) => message.id === 1)).result.serverInfo.name, "research_provenance");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const listed = await take((message) => message.id === 2);
  assert.equal(listed.result.tools.length, 7);
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

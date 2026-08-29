import assert from "node:assert/strict";
import { test } from "node:test";

import * as aioCli from "../src/aio-cli.js";

test("owner CLI handlers run in process", async () => {
  const dispatchCliRoute = (aioCli as Record<string, unknown>).dispatchCliRoute;
  assert.equal(typeof dispatchCliRoute, "function");
  assert.equal(typeof (aioCli as Record<string, unknown>).runOwnerCli, "function");
});

test("owner CLI module handlers scope argv and preserve the imported exit status", async () => {
  const originalArgv = process.argv;
  const handler = aioCli.ownerCliModuleHandler(async () => {
    assert.deepEqual(process.argv.slice(2), ["project", "--stage", "release"]);
    process.exitCode = 7;
  });
  assert.equal(await handler(["project", "--stage", "release"]), 7);
  assert.equal(process.argv, originalArgv);
});

test("owner CLI module handlers preserve the public harness invocation for capability binding", async () => {
  const originalArgv = process.argv;
  process.argv = [process.execPath, "/plugin/dist/cli/harness.mjs", "logo", "render", "/workspace/artifacts/logo/demo", "release"];
  try {
    const handler = aioCli.ownerCliModuleHandler(async () => {
      assert.deepEqual(process.argv.slice(2), ["/workspace/artifacts/logo/demo", "release"]);
      assert.deepEqual(aioCli.currentOwnerCliArgv(), [
        "/plugin/dist/cli/harness.mjs",
        "logo",
        "render",
        "/workspace/artifacts/logo/demo",
        "release",
      ]);
    });
    assert.equal(await aioCli.dispatchCliRoute({
      argv: process.argv.slice(2),
      handlers: { "logo:render": handler },
      routes: { logo: { render: { handler: "logo:render" } } },
    }), 0);
  } finally {
    process.argv = originalArgv;
  }
});

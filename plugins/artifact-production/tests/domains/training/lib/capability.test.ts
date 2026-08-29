import assert from "node:assert/strict";
import test from "node:test";

import { dispatchCliRoute, ownerCliModuleHandler } from "../../../../../../core/src/aio-cli.js";
import { processWriterArgv } from "../../../../src/domains/training/lib/capability.js";

test("writer capability binds to the public owner harness invocation", async () => {
  const originalArgv = process.argv;
  process.argv = [process.execPath, "/plugin/dist/cli/harness.mjs", "training", "render", "/workspace/artifacts/training/demo"];
  try {
    const handler = ownerCliModuleHandler(async () => assert.deepEqual(processWriterArgv(), process.argv.slice(0, 0).concat("/plugin/dist/cli/harness.mjs", "training", "render", "/workspace/artifacts/training/demo")));
    await dispatchCliRoute({ argv: process.argv.slice(2), handlers: { render: handler }, routes: { training: { render: { handler: "render" } } } });
  } finally { process.argv = originalArgv; }
});

import assert from "node:assert/strict";
import { test } from "node:test";

import * as aioCli from "../../src/aio-cli.js";

test("CLI exposes owner-command routing without a module process boundary", async () => {
  assert.equal(typeof aioCli.dispatchCliRoute, "function");
  const calls: string[][] = [];
  const status = await aioCli.dispatchCliRoute({
    argv: ["debug", "resume", "--id", "DBG-1"],
    routes: { debug: { "*": { handler: "debugging", forwardAction: true } } },
    handlers: { debugging: (args: string[]) => { calls.push(args); return 0; } },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls, [["resume", "--id", "DBG-1"]]);
});

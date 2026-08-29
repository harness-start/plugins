import assert from "node:assert/strict";
import { test } from "node:test";

import * as aioCli from "../src/aio-cli.js";

test("owner CLI handlers run in process", async () => {
  const dispatchCliRoute = (aioCli as Record<string, unknown>).dispatchCliRoute;
  assert.equal(typeof dispatchCliRoute, "function");
  assert.equal(typeof (aioCli as Record<string, unknown>).runOwnerCli, "function");
});

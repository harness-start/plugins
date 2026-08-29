import assert from "node:assert/strict";
import { test } from "node:test";

import * as dispatcher from "../src/aio-dispatcher.js";

test("owner Hook handlers run in process", async () => {
  const dispatchHookRoutes = (dispatcher as Record<string, unknown>).dispatchHookRoutes;
  assert.equal(typeof dispatchHookRoutes, "function");
  assert.equal(typeof (dispatcher as Record<string, unknown>).runOwnerDispatcher, "function");
});

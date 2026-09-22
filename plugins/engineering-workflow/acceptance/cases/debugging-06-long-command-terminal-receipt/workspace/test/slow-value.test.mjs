import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import { value } from "../src/value.mjs";

test("returns the configured value after delayed work", async () => {
  await delay(35_000);
  assert.equal(value(), 42);
});

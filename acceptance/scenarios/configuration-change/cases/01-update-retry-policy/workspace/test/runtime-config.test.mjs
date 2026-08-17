import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const configUrl = new URL("../config/runtime.json", import.meta.url);

test("runtime configuration satisfies the supported schema", async () => {
  const config = JSON.parse(await readFile(configUrl, "utf8"));

  assert.deepEqual(Object.keys(config).sort(), ["features", "retry", "timeouts"]);
  assert.equal(Number.isInteger(config.retry.maxAttempts), true);
  assert.equal(config.retry.maxAttempts > 0, true);
  assert.equal(Number.isInteger(config.retry.baseDelayMs), true);
  assert.equal(config.retry.baseDelayMs > 0, true);
  assert.equal(config.retry.maxDelayMs >= config.retry.baseDelayMs, true);
  assert.equal(typeof config.retry.jitter, "boolean");
  assert.equal(Number.isInteger(config.timeouts.requestMs), true);
  assert.equal(typeof config.features.adaptiveBackoff, "boolean");
  assert.equal(typeof config.features.requestCoalescing, "boolean");
});

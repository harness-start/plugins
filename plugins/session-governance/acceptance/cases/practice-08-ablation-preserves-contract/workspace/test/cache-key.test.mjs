import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCacheKey } from "../src/cache-key.mjs";

test("cache keys preserve the platform-specific case contract", () => {
  assert.equal(normalizeCacheKey("win32", "Users\\Ada\\Cache"), "users/ada/cache");
  assert.equal(normalizeCacheKey("posix", "Users\\Ada\\Cache"), "Users/Ada/Cache");
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

test("owner routes the private Android guard and its Skills stay bundled", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "android");
  assert.equal(existsSync(new URL("../skills/android-engineering/SKILL.md", import.meta.url)), true);
});

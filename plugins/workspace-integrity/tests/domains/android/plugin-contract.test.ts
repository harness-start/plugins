import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { assertHandlerRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

test("owner routes aggregate domain guards and keeps the Android entry Skill bundled", () => {
  assertHandlerRoutedOnBothHosts(import.meta.url, "domains:pre-tool");
  assertHandlerRoutedOnBothHosts(import.meta.url, "domains:post-tool");
  assertHandlerRoutedOnBothHosts(import.meta.url, "domains:stop");
  assert.equal(existsSync(new URL("../../../skills/android-engineering/SKILL.md", import.meta.url)), true);
});

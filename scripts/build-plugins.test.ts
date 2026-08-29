import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

test("owner build and test discovery do not scan legacy module build units", () => {
  const build = readFileSync(resolve(root, "scripts/build-plugins.ts"), "utf8");
  const tests = readFileSync(resolve(root, "scripts/run-tests.ts"), "utf8");
  assert.doesNotMatch(build, /resolve\(pluginRoot,\s*"modules"/u);
  assert.doesNotMatch(tests, /resolve\(root,\s*"plugins",\s*plugin\.name,\s*"modules"/u);
});

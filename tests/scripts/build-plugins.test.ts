import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

type BuildScript = typeof import("../../scripts/build-plugins.js");
void (null as BuildScript | null);

test("build script compiles only fused owner units", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../../scripts/build-plugins.ts"), "utf8");
  assert.doesNotMatch(source, /resolve\(pluginRoot,\s*"modules"/u);
  assert.match(source, /resolve\(pluginRoot,\s*"src"/u);
});

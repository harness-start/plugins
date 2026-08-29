import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import * as syncVideoShotLibrary from "./sync-video-shot-library.js";

test("video shot library sync writes into the fused artifact owner", () => {
  const source = readFileSync(resolve(import.meta.dirname, "sync-video-shot-library.ts"), "utf8");
  assert.doesNotMatch(source, /artifact-production\/modules\/video/u);
  assert.doesNotMatch(source, /modules\/video\/licenses/u);
  assert.match(source, /artifact-production\/src\/domains\/video\/generated/u);
  assert.match(source, /artifact-production\/licenses\/video-shotcraft/u);
  assert.equal(typeof syncVideoShotLibrary.runSync, "function");
});

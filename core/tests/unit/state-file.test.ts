import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { atomicWriteJson, digestKey, withPathLock } from "@harness/core/state-file";

test("atomicWriteJson writes JSON behind a lock", () => {
  const dir = mkdtempSync(join(tmpdir(), "state-file-"));
  const path = join(dir, "session.json");
  const ok = withPathLock(path, () => atomicWriteJson(path, { version: 1 }));
  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { version: 1 });
  assert.equal(digestKey("abc").length, 64);
});

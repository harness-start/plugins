import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

test("JSON validation exits non-zero when findings are present", () => {
  const root = mkdtempSync(join(tmpdir(), "logo-validate-json-"));
  try {
    const result = spawnSync(process.execPath, [ENTRY, "logo", "validate", root, "--stage", "source", "--json"], { encoding: "utf8" });
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(result.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

try {
  const report = JSON.parse(await readFile(new URL("../reports/result.json", import.meta.url), "utf8"));
  assert.deepEqual(report, { sum: 6, max: 3 });
  process.stdout.write("# pass 1\n# fail 0\n");
} catch (error) {
  process.stderr.write(`REPORT_MISSING ${error.message}\n# pass 0\n# fail 1\n`);
  process.exitCode = 1;
}

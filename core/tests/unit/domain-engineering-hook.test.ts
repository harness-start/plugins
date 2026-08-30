import assert from "node:assert/strict";
import { test } from "node:test";

import { sourceScanFindings, type DomainSourceScan } from "../../src/domain-engineering-hook.js";

test("domain engineering clamps advisory checks to report", () => {
  const scan: DomainSourceScan = {
    id: "reviewOnly",
    enforcement: "advisory",
    match: /\.txt$/u,
    mode: "report",
    inspect: () => [{ line: 1, code: "REVIEW", message: "review this" }],
  };
  assert.equal(sourceScanFindings(scan, "note.txt", "text", "block")[0]?.mode, "report");
});

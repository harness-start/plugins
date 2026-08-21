import assert from "node:assert/strict";
import { test } from "node:test";

import { sourceScanFindings, type DomainSourceScan } from "@harness/core/domain-engineering-hook";

test("source scans attach line numbers and honor off mode", () => {
  const scan: DomainSourceScan = {
    id: "composeCollectAsState",
    match: /\.(?:kt|kts)$/iu,
    mode: "report",
    inspect: () => [{ line: 4, code: "COLLECT_AS_STATE", message: "use collectAsStateWithLifecycle()" }],
  };
  assert.deepEqual(sourceScanFindings(scan, "app/Main.kt", "unused", "report"), [{
    check: "composeCollectAsState",
    mode: "report",
    path: "app/Main.kt:4",
    message: "COLLECT_AS_STATE: use collectAsStateWithLifecycle()",
  }]);
  assert.deepEqual(sourceScanFindings(scan, "app/Main.kt", "unused", "off"), []);
  assert.deepEqual(sourceScanFindings(scan, "app/Main.java", "unused", "report"), []);
});

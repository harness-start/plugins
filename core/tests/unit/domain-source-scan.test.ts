import assert from "node:assert/strict";
import { test } from "node:test";

import { sourceScanFindings, type DomainSourceScan } from "@harness/core/domain-engineering-hook";

test("source scans attach line numbers and honor off mode", () => {
  const scan: DomainSourceScan = {
    id: "composeCollectAsState",
    enforcement: "advisory",
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

test("advisory scans cannot be escalated to blocking mode", () => {
  const advisory: DomainSourceScan = {
    id: "advisory",
    enforcement: "advisory",
    match: /\.txt$/u,
    mode: "report",
    inspect: () => [{ line: 1, code: "NOTE", message: "review this" }],
  };
  const deterministic: DomainSourceScan = { ...advisory, id: "deterministic", enforcement: "deterministic", mode: "block" };

  assert.equal(sourceScanFindings(advisory, "note.txt", "text", "block")[0]?.mode, "report");
  assert.equal(sourceScanFindings(deterministic, "note.txt", "text", "block")[0]?.mode, "block");
});

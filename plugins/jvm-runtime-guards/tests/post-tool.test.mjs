import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectDebtFindings, formatDebtReport } from "../scripts/checks/debt.mjs";
import * as encoding from "../scripts/checks/encoding.mjs";

test("encoding matches language extensions", () => {
  assert.equal(encoding.matches("a.java"), true);
  assert.equal(encoding.matches("a.md"), false);
});

test("encoding detects UTF-8 BOM", () => {
  const dir = mkdtempSync(join(tmpdir(), "jvm-enc-"));
  const file = join(dir, "x.java");
  try {
    writeFileSync(file, Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]));
    const issues = encoding.check(file);
    assert.ok(issues.some((i) => i.kind === "bom"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds net-new SuppressWarnings without baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "jvm-debt-"));
  const file = join(dir, "Service.java");
  try {
    const content =
      "class Service {\n  @SuppressWarnings(\"unchecked\")\n  void run() {}\n}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected SuppressWarnings findings, got ${JSON.stringify(findings)}`);
    assert.ok(
      findings.some((f) => /SuppressWarnings/i.test(f.label)),
      `expected SuppressWarnings label, got ${findings.map((f) => f.label).join(",")}`,
    );
    const report = formatDebtReport(file, findings);
    assert.match(report, /JVM Debt Guard/);
    assert.match(report, /SuppressWarnings/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds Thread.sleep synchronization", () => {
  const dir = mkdtempSync(join(tmpdir(), "jvm-sleep-"));
  const file = join(dir, "Waiter.java");
  try {
    const content = "class Waiter {\n  void pause() throws Exception { Thread.sleep(100); }\n}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected sleep findings, got ${JSON.stringify(findings)}`);
    const report = formatDebtReport(file, findings);
    assert.match(report, /Debt Guard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

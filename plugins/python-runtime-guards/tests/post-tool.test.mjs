import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectDebtFindings, formatDebtReport } from "../scripts/checks/debt.mjs";
import * as encoding from "../scripts/checks/encoding.mjs";

test("encoding matches language extensions", () => {
  assert.equal(encoding.matches("a.py"), true);
  assert.equal(encoding.matches("a.md"), false);
});

test("encoding detects UTF-8 BOM", () => {
  const dir = mkdtempSync(join(tmpdir(), "python-enc-"));
  const file = join(dir, "x.py");
  try {
    writeFileSync(file, Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]));
    const issues = encoding.check(file);
    assert.ok(issues.some((i) => i.kind === "bom"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds net-new bare except without baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "python-debt-"));
  const file = join(dir, "service.py");
  try {
    // Real newlines required — bare-except pattern anchors on line start.
    const content = "def f():\n    try:\n        return 1\n    except:\n        pass\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected bare-except findings, got ${JSON.stringify(findings)}`);
    assert.ok(
      findings.some((f) => /bare except/i.test(f.label)),
      `expected bare except label, got ${findings.map((f) => f.label).join(",")}`,
    );
    const report = formatDebtReport(file, findings);
    assert.match(report, /Python Debt Guard/);
    assert.match(report, /except/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds type ignore without justification", () => {
  const dir = mkdtempSync(join(tmpdir(), "python-type-ignore-"));
  const file = join(dir, "types.py");
  try {
    const content = "x = load()  # type: ignore\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected type-ignore findings, got ${JSON.stringify(findings)}`);
    const report = formatDebtReport(file, findings);
    assert.match(report, /Debt Guard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

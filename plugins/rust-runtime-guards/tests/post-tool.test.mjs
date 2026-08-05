import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectDebtFindings, formatDebtReport } from "../scripts/checks/debt.mjs";
import * as encoding from "../scripts/checks/encoding.mjs";

test("encoding matches language extensions", () => {
  assert.equal(encoding.matches("a.rs"), true);
  assert.equal(encoding.matches("a.md"), false);
});

test("encoding detects UTF-8 BOM", () => {
  const dir = mkdtempSync(join(tmpdir(), "rust-enc-"));
  const file = join(dir, "x.rs");
  try {
    writeFileSync(file, Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]));
    const issues = encoding.check(file);
    assert.ok(issues.some((i) => i.kind === "bom"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds net-new unwrap without baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "rust-debt-"));
  const file = join(dir, "svc.rs");
  try {
    const content = "fn load() -> String {\n    std::fs::read_to_string(\"x\").unwrap()\n}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected unwrap findings, got ${JSON.stringify(findings)}`);
    assert.ok(
      findings.some((f) => /unwrap|expect/i.test(f.label)),
      `expected unwrap/expect label, got ${findings.map((f) => f.label).join(",")}`,
    );
    const report = formatDebtReport(file, findings);
    assert.match(report, /Rust Debt Guard/);
    assert.match(report, /unwrap|expect/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds allow attribute without justification", () => {
  const dir = mkdtempSync(join(tmpdir(), "rust-allow-"));
  const file = join(dir, "lib.rs");
  try {
    const content = "#[allow(dead_code)]\nfn unused() {}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected allow findings, got ${JSON.stringify(findings)}`);
    const report = formatDebtReport(file, findings);
    assert.match(report, /Debt Guard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

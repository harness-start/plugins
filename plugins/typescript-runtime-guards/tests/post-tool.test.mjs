import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectDebtFindings, formatDebtReport } from "../scripts/checks/debt.mjs";
import * as encoding from "../scripts/checks/encoding.mjs";

test("encoding matches language extensions", () => {
  assert.equal(encoding.matches("a.ts"), true);
  assert.equal(encoding.matches("a.md"), false);
});

test("encoding detects UTF-8 BOM", () => {
  const dir = mkdtempSync(join(tmpdir(), "ts-enc-"));
  const file = join(dir, "x.ts");
  try {
    writeFileSync(file, Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]));
    const issues = encoding.check(file);
    assert.ok(issues.some((i) => i.kind === "bom"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds net-new any without baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "ts-debt-"));
  const file = join(dir, "handler.ts");
  try {
    const content = "export function load(id: string): any {\n  return id;\n}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected debt findings, got ${JSON.stringify(findings)}`);
    assert.ok(
      findings.some((f) => f.label.includes("any") || /any/i.test(f.label)),
      `expected any-related debt, got ${findings.map((f) => f.label).join(",")}`,
    );
    const report = formatDebtReport(file, findings);
    assert.match(report, /TypeScript Debt Guard/);
    assert.match(report, /any/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds as any assertion", () => {
  const dir = mkdtempSync(join(tmpdir(), "ts-asany-"));
  const file = join(dir, "cast.ts");
  try {
    const content = "const value = input as any;\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected as-any findings, got ${JSON.stringify(findings)}`);
    const report = formatDebtReport(file, findings);
    assert.match(report, /Debt Guard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

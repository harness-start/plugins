import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectDebtFindings, formatDebtReport } from "../scripts/checks/debt.mjs";
import * as encoding from "../scripts/checks/encoding.mjs";

test("encoding matches language extensions", () => {
  assert.equal(encoding.matches("a.go"), true);
  assert.equal(encoding.matches("a.md"), false);
});

test("encoding detects UTF-8 BOM", () => {
  const dir = mkdtempSync(join(tmpdir(), "go-enc-"));
  const file = join(dir, "x.go");
  try {
    writeFileSync(file, Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]));
    const issues = encoding.check(file);
    assert.ok(issues.some((i) => i.kind === "bom"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds net-new nolint without baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "go-debt-"));
  const file = join(dir, "svc.go");
  try {
    const content = "package svc\n\nfunc f() {\n\t// nolint\n}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected nolint findings, got ${JSON.stringify(findings)}`);
    assert.ok(
      findings.some((f) => /nolint/i.test(f.label)),
      `expected nolint label, got ${findings.map((f) => f.label).join(",")}`,
    );
    const report = formatDebtReport(file, findings);
    assert.match(report, /Go Debt Guard/);
    assert.match(report, /nolint/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt finds panic without justification", () => {
  const dir = mkdtempSync(join(tmpdir(), "go-panic-"));
  const file = join(dir, "handler.go");
  try {
    const content = "package h\n\nfunc Must() {\n\tpanic(\"boom\")\n}\n";
    writeFileSync(file, content);
    const findings = collectDebtFindings({ file_path: file, content }, file);
    assert.ok(findings.length >= 1, `expected panic findings, got ${JSON.stringify(findings)}`);
    const report = formatDebtReport(file, findings);
    assert.match(report, /Debt Guard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

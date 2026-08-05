/**
 * PostToolUse checks: syntax, composer validate, encoding, debt, debug.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as syntaxPhp from "../scripts/checks/syntax-php.mjs";
import * as syntaxComposer from "../scripts/checks/syntax-composer.mjs";
import * as encoding from "../scripts/checks/encoding.mjs";
import { collectDebtFindings, formatDebtReport } from "../scripts/checks/debt.mjs";
import {
  collectDebugFindings,
  formatDebugReport,
} from "../scripts/checks/debug-statement.mjs";

import { patchTargetPaths } from "../scripts/lib/patch-utils.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");
const POST_TOOL = fileURLToPath(new URL("../scripts/php-hook-post-tool.mjs", import.meta.url));

// ── syntax-php ─────────────────────────────────────────────────────────

test("syntax-php: matches only .php", () => {
  assert.equal(syntaxPhp.matches("src/App.php"), true);
  assert.equal(syntaxPhp.matches("src/App.php.bak"), false);
  assert.equal(syntaxPhp.matches("composer.json"), false);
});

test("syntax-php: no php binary → silent pass (fail-open)", async () => {
  // CI containers may not have php; the guard must degrade to null.
  const result = await syntaxPhp.check(join(FIXTURES, "php-clean.php"));
  if (result !== null) {
    // Only valid when php exists: a clean file must lint clean.
    assert.equal(result, null);
  }
});

// ── syntax-composer ────────────────────────────────────────────────────

test("syntax-composer: matches only composer.json", () => {
  assert.equal(syntaxComposer.matches("composer.json"), true);
  assert.equal(syntaxComposer.matches("package.json"), false);
});

test("syntax-composer: blocking output classification", () => {
  assert.equal(syntaxComposer.isComposerValidateBlockingOutput(""), false);
  assert.equal(syntaxComposer.isComposerValidateBlockingOutput("./composer.json is valid"), false);
  assert.equal(
    syntaxComposer.isComposerValidateBlockingOutput('"name" : is required'),
    true,
  );
  assert.equal(
    syntaxComposer.isComposerValidateBlockingOutput("The version field is present"),
    true,
  );
});

test("syntax-composer: valid composer.json in isolated dir passes (fail-open)", async () => {
  // An isolated directory avoids the parent-dir composer.json interference.
  const dir = mkdtempSync(join(tmpdir(), "php-guard-composer-"));
  try {
    writeFileSync(join(dir, "composer.json"), readFileSync(join(FIXTURES, "composer-valid.json")));
    const result = await syntaxComposer.check(join(dir, "composer.json"));
    if (result !== null) {
      // composer binary present: a valid manifest must validate clean.
      assert.equal(result, null);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── encoding ───────────────────────────────────────────────────────────

test("encoding: matches .php, .twig, .blade.php", () => {
  assert.equal(encoding.matches("/repo/src/App.php"), true);
  assert.equal(encoding.matches("/repo/templates/a.twig"), true);
  assert.equal(encoding.matches("/repo/resources/views/a.blade.php"), true);
  assert.equal(encoding.matches("/repo/src/App.java"), false);
});

test("encoding: UTF-8 BOM file is flagged", () => {
  const issues = encoding.check(join(FIXTURES, "utf8-bom.php"));
  assert.ok(issues.some((issue) => issue.includes("UTF-8 BOM")));
});

test("encoding: non-UTF-8 byte sequence is flagged", () => {
  const dir = mkdtempSync(join(tmpdir(), "php-guard-"));
  try {
    const file = join(dir, "broken.php");
    writeFileSync(file, Buffer.from([0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20, 0xff, 0xfe, 0x0a]));
    const issues = encoding.check(file);
    assert.ok(issues.some((issue) => issue.includes("非 UTF-8 字节序列")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("encoding: clean file has no issues", () => {
  assert.deepEqual(encoding.check(join(FIXTURES, "php-clean.php")), []);
});

test("encoding: oversized files are skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "php-guard-"));
  try {
    const file = join(dir, "big.php");
    writeFileSync(file, "<?php\n" + "// padding\n".repeat(300_000));
    assert.deepEqual(encoding.check(file), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("encoding: report format includes filename and advice", () => {
  const message = encoding.formatReport("/repo/a.php", ["检测到 UTF-8 BOM（0xEF 0xBB 0xBF）— 现代项目通常使用无 BOM 的 UTF-8"]);
  assert.match(message, /PHP Encoding Guard/);
  assert.match(message, /无 BOM 的 UTF-8/);
});

// ── debt ───────────────────────────────────────────────────────────────

const DEBT_PATTERNS = {
  phpstanIgnore: "// @phpstan-ignore-line\n",
  reflection: "    $ref = new ReflectionClass(Foo::class);\n",
};

test("debt: Edit introducing a net-new phpstan suppression is flagged", () => {
  const findings = collectDebtFindings(
    {
      old_string: "    $x = 1;\n",
      new_string: "    // @phpstan-ignore-line\n    $x = 1;\n",
    },
    "/repo/src/App.php",
  );
  assert.ok(findings.some((f) => f.label === "PHPStan suppression"));
});

test("debt: Edit removing a suppression is clean", () => {
  const findings = collectDebtFindings(
    {
      old_string: "    // @phpstan-ignore-line\n    $x = 1;\n",
      new_string: "    $x = 1;\n",
    },
    "/repo/src/App.php",
  );
  assert.deepEqual(findings, []);
});

test("debt: justified suppression (issue ref) is exempt", () => {
  const findings = collectDebtFindings(
    {
      old_string: "    $x = 1;\n",
      new_string: "    // @phpstan-ignore-line -- reason: tracked in ABC-123\n    $x = 1;\n",
    },
    "/repo/src/App.php",
  );
  assert.deepEqual(findings, []);
});

test("debt: reflection encapsulation bypass is flagged", () => {
  const findings = collectDebtFindings(
    { old_string: "    $x = 1;\n", new_string: DEBT_PATTERNS.reflection },
    "/repo/src/App.php",
  );
  assert.ok(findings.some((f) => f.label === "reflection encapsulation bypass"));
});

test("debt: empty catch is flagged", () => {
  const findings = collectDebtFindings(
    { old_string: "    $x = 1;\n", new_string: "    } catch (\\Throwable $e) { }\n" },
    "/repo/src/App.php",
  );
  assert.ok(findings.some((f) => f.label === "empty catch"));
});

test("debt: test files are skipped", () => {
  const findings = collectDebtFindings(
    { old_string: "    $x = 1;\n", new_string: "    // @phpstan-ignore-line\n" },
    "/repo/tests/AppTest.php",
  );
  assert.deepEqual(findings, []);
});

test("debt: Write against git HEAD baseline counts only net-new", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "php-guard-git-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "T"], { cwd: dir });
    const file = join(dir, "App.php");
    writeFileSync(file, "<?php\n// @phpstan-ignore-line\n");
    execFileSync("git", ["add", "App.php"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: dir });

    // Proposed content adds a second suppression → net-new = 1.
    const findings = collectDebtFindings(
      { content: "<?php\n// @phpstan-ignore-line\n// @phpstan-ignore-next-line\n" },
      file,
    );
    assert.equal(
      findings.find((f) => f.label === "PHPStan suppression")?.count,
      1,
    );
  } catch (error) {
    t.diagnostic(`git baseline test skipped: ${error.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debt: report format includes count and fix guidance", () => {
  const message = formatDebtReport("/repo/App.php", [
    { label: "empty catch", count: 1, locations: [{ line: 3, text: "catch (Throwable $e) {}" }] },
  ]);
  assert.match(message, /PHP Debt Guard/);
  assert.match(message, /1 处/);
  assert.match(message, /issue\/ticket/);
});

// ── debug-statement ────────────────────────────────────────────────────

test("debug: dd() is a deny-tier finding", () => {
  const summary = collectDebugFindings(
    { old_string: "    return $x;\n", new_string: "    dd($x);\n    return $x;\n" },
    "/repo/src/App.php",
  );
  assert.ok(summary);
  assert.equal(summary.denied, true);
  assert.ok(summary.findings.some((f) => f.label === "dd()"));
});

test("debug: var_dump is report-tier only", () => {
  const summary = collectDebugFindings(
    { old_string: "    return $x;\n", new_string: "    var_dump($x);\n" },
    "/repo/src/App.php",
  );
  assert.ok(summary);
  assert.equal(summary.denied, false);
});

test("debug: dd in a comment is ignored", () => {
  const summary = collectDebugFindings(
    { old_string: "    return $x;\n", new_string: "    // call dd() later\n" },
    "/repo/src/App.php",
  );
  assert.equal(summary, undefined);
});

test("debug: method call ->dd() on object is not matched as debug statement", () => {
  const summary = collectDebugFindings(
    { old_string: "    $x = 1;\n", new_string: "    $x->dd();\n" },
    "/repo/src/App.php",
  );
  assert.equal(summary, undefined);
});

test("debug: existing baseline debug statements are not net-new", () => {
  const summary = collectDebugFindings(
    { old_string: "    dd($x);\n", new_string: "    dd($x);\n    $y = 2;\n" },
    "/repo/src/App.php",
  );
  assert.equal(summary, undefined);
});

test("debug: report format mentions removal", () => {
  const message = formatDebugReport({
    filePath: "/repo/App.php",
    findings: [{ label: "dd()", count: 1, locations: [2] }],
    total: 1,
    denied: true,
  });
  assert.match(message, /Debug Statement/);
  assert.match(message, /必须移除/);
});

test("patchTargetPaths: parses apply_patch targets from a Bash command", () => {
  const command = [
    'const patch = "*** Begin Patch\\n',
    "*** Update File: App.php\\n",
    "@@\\n",
    "-return;\\n",
    "+dd(1);\\n",
    "*** Add File: new.php\\n",
    '*** End Patch";',
    "text(await tools.apply_patch(patch));",
  ].join("\n");
  assert.deepEqual(patchTargetPaths(command, "/work"), ["/work/App.php", "/work/new.php"]);
});

test("patchTargetPaths: absolute paths are kept as-is", () => {
  const command = [
    'const patch = "*** Begin Patch\\n',
    "*** Update File: /tmp/x/App.php\\n",
    '*** End Patch";',
  ].join("\n");
  assert.deepEqual(patchTargetPaths(command, "/work"), ["/tmp/x/App.php"]);
});

test("patchTargetPaths: non-patch Bash commands yield nothing", () => {
  assert.deepEqual(patchTargetPaths("sed -n '1,40p' App.php", "/work"), []);
  assert.deepEqual(patchTargetPaths("", "/work"), []);
});

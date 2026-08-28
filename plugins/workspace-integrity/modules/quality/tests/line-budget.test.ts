import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countLines,
  extractFilePaths,
  matchRule,
  resolveRules,
} from "../src/entries/hooks/line-budget-check.js";
import { classifyBudgetState } from "../src/lib/budget-policy.js";

const ENTRY = fileURLToPath(
  new URL("../dist/hooks/engineering-quality-post.mjs", import.meta.url),
);

test("countLines handles empty, unterminated, and CRLF text", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("one"), 1);
  assert.equal(countLines("one\r\ntwo\r\n"), 2);
});

test("resolveRules gives a valid user rule precedence over built-ins", () => {
  const custom = { match: /src\/legacy\.php$/, budget: 25, mode: "report" };
  const { rules, settings } = resolveRules({
    rules: [custom],
    settings: { oversizeSoftGrowthLimit: 7 },
  });

  assert.equal(rules[0], custom);
  assert.equal(matchRule("src/legacy.php", rules), custom);
  assert.equal(settings.oversizeSoftGrowthLimit, 7);
});

test("resolveRules defaults an omitted user rule mode to block", () => {
  const { rules } = resolveRules({
    rules: [{ match: /src\/limited[.]php$/, budget: 1 }],
  });

  assert.deepEqual(rules[0], {
    match: /src\/limited[.]php$/,
    budget: 1,
    mode: "block",
  });
  assert.equal(matchRule("src/limited.php", rules)?.mode, "block");
});

test("resolveRules rejects user rules with an unsupported mode", () => {
  const previous = process.stderr.write;
  process.stderr.write = () => true;
  try {
    const { rules } = resolveRules({
      rules: [{ match: /[.]php$/, budget: 1, mode: "observe" }],
    });

    assert.equal(rules[0].mode, "skip");
    assert.equal(matchRule("src/example.php", rules)?.budget, 500);
    assert.equal(matchRule("src/example.php", rules)?.mode, "block");
  } finally {
    process.stderr.write = previous;
  }
});

test("resolveRules ignores malformed and invalid settings", () => {
  const previous = process.stderr.write;
  process.stderr.write = () => true;
  try {
    const malformed = resolveRules({ settings: "invalid" }).settings;
    assert.deepEqual(malformed, {
      nearBudgetWarnRatio: 0.8,
      warnCooldownMinutes: 30,
      oversizeSoftGrowthLimit: 100,
    });

    const invalidValues = resolveRules({
      settings: {
        nearBudgetWarnRatio: 2,
        warnCooldownMinutes: -1,
        oversizeSoftGrowthLimit: Number.POSITIVE_INFINITY,
      },
    }).settings;
    assert.deepEqual(invalidValues, {
      nearBudgetWarnRatio: 0.8,
      warnCooldownMinutes: 30,
      oversizeSoftGrowthLimit: 100,
    });
  } finally {
    process.stderr.write = previous;
  }
});

test("default legacy growth allowance stays bounded but permits maintenance", () => {
  const { settings } = resolveRules(null);

  assert.equal(settings.oversizeSoftGrowthLimit, 100);
});

test("matchRule skips tests before applying source-file budgets", () => {
  const { rules } = resolveRules(null);

  assert.equal(matchRule("tests/unit/example.php", rules)?.mode, "skip");
  assert.deepEqual(matchRule("src/example.php", rules), {
    match: /\.php$/,
    budget: 500,
    mode: "block",
  });
  assert.equal(matchRule("README.md", rules), null);
});

test("matchRule evaluates a global RegExp consistently across calls", () => {
  const rule = { match: /[.]js$/gu, budget: 100, mode: "block" };

  assert.equal(matchRule("src/example.js", [rule]), rule);
  assert.equal(matchRule("src/example.js", [rule]), rule);
});

test("matchRule evaluates a sticky RegExp consistently across calls", () => {
  const rule = { match: /^src\/example[.]js$/yu, budget: 100, mode: "block" };

  assert.equal(matchRule("src/example.js", [rule]), rule);
  assert.equal(matchRule("src/example.js", [rule]), rule);
});

test("extractFilePaths normalizes direct and apply_patch targets", () => {
  const paths = extractFilePaths({
    cwd: "/repo",
    tool_input: {
      file_path: "src/direct.php",
      patch: [
        "*** Begin Patch",
        "*** Update File: src/patched.php",
        "*** End Patch",
      ].join("\n"),
    },
  });

  assert.deepEqual(paths, ["/repo/src/direct.php", "/repo/src/patched.php"]);
});

test("extractFilePaths recognizes shell redirect targets", () => {
  const paths = extractFilePaths({
    cwd: "/repo",
    tool_input: { command: "printf x > src/generated.ts" },
  });

  assert.deepEqual(paths, ["/repo/src/generated.ts"]);
});

const SETTINGS = {
  nearBudgetWarnRatio: 0.8,
  oversizeSoftGrowthLimit: 20,
};

test("budget policy allows normal files and warns near the limit", () => {
  assert.deepEqual(
    classifyBudgetState({
      mode: "block",
      currentLines: 79,
      budget: 100,
      headLines: null,
      settings: SETTINGS,
    }),
    { action: "allow", kind: "within-budget" },
  );
  assert.deepEqual(
    classifyBudgetState({
      mode: "block",
      currentLines: 80,
      budget: 100,
      headLines: null,
      settings: SETTINGS,
    }),
    { action: "warn", kind: "near-budget" },
  );
});

test("budget policy blocks new and newly oversized files", () => {
  assert.equal(
    classifyBudgetState({
      mode: "block",
      currentLines: 101,
      budget: 100,
      headLines: null,
      settings: SETTINGS,
    }).kind,
    "new-over",
  );
  assert.equal(
    classifyBudgetState({
      mode: "block",
      currentLines: 101,
      budget: 100,
      headLines: 99,
      settings: SETTINGS,
    }).kind,
    "crossed-budget",
  );
});

test("budget policy ratchets historically oversized files", () => {
  const base = { mode: "block", budget: 100, settings: SETTINGS };

  assert.deepEqual(
    classifyBudgetState({ ...base, currentLines: 215, headLines: 200 }),
    { action: "allow", kind: "historical-soft-growth", growth: 15 },
  );
  assert.deepEqual(
    classifyBudgetState({ ...base, currentLines: 221, headLines: 200 }),
    { action: "block", kind: "historical-hard-growth", growth: 21 },
  );
  assert.deepEqual(
    classifyBudgetState({ ...base, currentLines: 180, headLines: 200 }),
    { action: "warn", kind: "historical-shrink", shrink: 20 },
  );
  assert.deepEqual(
    classifyBudgetState({ ...base, currentLines: 200, headLines: 200 }),
    { action: "allow", kind: "historical-unchanged" },
  );
});

function runEntry(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("entry fails open with empty output for malformed JSON", async () => {
  const result = await runEntry("{");

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("entry blocks an oversized file when the matching rule omits mode", async () => {
  const root = mkdtempSync(join(tmpdir(), "file-budget-default-mode-"));
  const sourceDir = join(root, "src");
  const target = join(sourceDir, "limited.php");
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    mkdirSync(sourceDir);
    writeFileSync(
      join(root, ".engineering-quality.mjs"),
      "export default { rules: [{ match: /src\\/limited[.]php$/, budget: 1 }] };\n",
    );
    writeFileSync(target, "<?php\nreturn 1;\n");

    const result = await runEntry(JSON.stringify({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: target },
    }));

    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, /exceeds its file line budget/);
    assert.match(result.stderr, /Current: 2 lines \| Budget: 1 lines/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry keeps small growth of a historically oversized file silent", async () => {
  const root = mkdtempSync(join(tmpdir(), "file-budget-cross-cwd-"));
  const target = join(root, "legacy.py");
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    writeFileSync(target, `${"pass\n".repeat(510)}`);
    execFileSync("git", ["add", "legacy.py"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "test: add legacy file"], { cwd: root });
    writeFileSync(target, `${"pass\n".repeat(540)}`);

    const result = await runEntry(JSON.stringify({
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: target },
    }));

    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /file line budget|exceeds its/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

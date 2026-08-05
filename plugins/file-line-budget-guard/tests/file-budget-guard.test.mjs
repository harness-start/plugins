import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  countLines,
  extractFilePaths,
  matchRule,
  resolveRules,
} from "../scripts/file-budget-guard.mjs";
import { classifyBudgetState } from "../scripts/lib/budget-policy.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/file-budget-guard.mjs", import.meta.url),
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
    { action: "warn", kind: "historical-soft-growth", growth: 15 },
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

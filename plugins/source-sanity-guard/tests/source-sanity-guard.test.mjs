import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeGarbledText,
  findMergeConflictMarkers,
  isBackupArtifactPath,
  isBuiltInSkippedPath,
  modeFor,
  resolveConfig,
} from "../scripts/lib/source-sanity-policy.mjs";
import {
  extractFileTargets,
  extractInsertedText,
  extractPatchTargets,
} from "../scripts/source-sanity-guard.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/source-sanity-guard.mjs", import.meta.url));

function runEntry(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function gitRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

test("backup artifacts require a source path segment and exact suffix", () => {
  for (const path of [
    "src/app.js.bak",
    "packages/api/lib/client.ts.orig",
    "tests/data.py~",
    "app/config.php.tmp",
  ]) assert.equal(isBackupArtifactPath(path), true, path);
  for (const path of [
    "notes/app.js.bak",
    "src/backup-plan.md",
    "src/old-fashioned.js",
    "src/tmp/file.js",
  ]) assert.equal(isBackupArtifactPath(path), false, path);
});

test("built-in exclusions match path segments without substring false positives", () => {
  assert.equal(isBuiltInSkippedPath("vendor/acme/file.php"), true);
  assert.equal(isBuiltInSkippedPath("src/generated/client.ts"), true);
  assert.equal(isBuiltInSkippedPath("src/vendorized/client.ts"), false);
});

test("garbled text requires consecutive or at least three replacement characters", () => {
  assert.equal(analyzeGarbledText("one \uFFFD character"), null);
  assert.equal(analyzeGarbledText("two \uFFFD separated \uFFFD characters"), null);
  assert.deepEqual(analyzeGarbledText("bad \uFFFD\uFFFD"), { replacementCharacters: 2 });
  assert.deepEqual(analyzeGarbledText("\uFFFD a \uFFFD b \uFFFD"), { replacementCharacters: 3 });
});

test("merge markers must start a line and report bounded positions", () => {
  assert.deepEqual(findMergeConflictMarkers([
    "const text = '<<<<<<< not a marker';",
    "<<<<<<< HEAD",
    "left",
    "=======",
    "right",
    ">>>>>>> branch",
  ].join("\n")), [
    { line: 2, marker: "<<<<<<<" },
    { line: 4, marker: "=======" },
    { line: 6, marker: ">>>>>>>" },
  ]);
});

test("config supports first matching per-check override and rejects invalid modes", () => {
  const warnings = [];
  const config = resolveConfig({
    checks: { backupArtifact: "report", garbledText: "invalid" },
    overrides: [
      { match: /^fixtures\//u, checks: { garbledText: "off" } },
      { match: /^fixtures\/strict\//u, checks: { garbledText: "block" } },
      { match: "src", checks: { mergeConflict: "off" } },
    ],
  }, (message) => warnings.push(message));
  assert.equal(config.checks.backupArtifact, "report");
  assert.equal(config.checks.garbledText, "block");
  assert.equal(modeFor("garbledText", "fixtures/strict/data.txt", config), "off");
  assert.equal(warnings.length, 2);
});

test("target and content extraction cover direct, nested, patch, and move inputs", () => {
  assert.deepEqual(extractPatchTargets([
    "*** Add File: src/new.js",
    "*** Update File: src/old.js",
    "*** Move to: src/moved.js",
  ].join("\n")), ["src/new.js", "src/old.js", "src/moved.js"]);
  const event = {
    cwd: "/repo",
    tool_name: "MultiEdit",
    tool_input: {
      file_path: "src/main.js",
      edits: [{ path: "src/other.js", new_string: "bad \uFFFD\uFFFD" }],
    },
  };
  assert.deepEqual(extractFileTargets(event), ["/repo/src/main.js", "/repo/src/other.js"]);
  assert.match(extractInsertedText(event), /\uFFFD\uFFFD/u);
  assert.deepEqual(extractFileTargets({ ...event, tool_name: "Bash" }), []);
});

test("pre hook denies backup artifacts before the file exists", async () => {
  const root = gitRoot("source-sanity-backup-");
  try {
    mkdirSync(join(root, "src"));
    const result = await runEntry("pre", {
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: "src/app.js.bak", content: "temporary" },
    });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /\[Source Sanity Guard\]/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook denies obvious garbling but allows one replacement character", async () => {
  const root = gitRoot("source-sanity-garbled-");
  try {
    mkdirSync(join(root, "src"));
    const blocked = await runEntry("pre", {
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: "src/app.js", new_string: "const value = '\uFFFD\uFFFD';" },
    });
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
    const allowed = await runEntry("pre", {
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: "src/app.js", new_string: "const value = '\uFFFD';" },
    });
    assert.deepEqual({ code: allowed.code, stdout: allowed.stdout, stderr: allowed.stderr }, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post hook blocks an unresolved final file and does not flag a clean file", async () => {
  const root = gitRoot("source-sanity-conflict-");
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.js");
    writeFileSync(target, "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n", "utf8");
    const event = { cwd: root, tool_name: "Write", tool_input: { file_path: target } };
    const blocked = await runEntry("post", event, { PLUGIN_ROOT: "/plugin" });
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /未解决的合并冲突/u);
    writeFileSync(target, "const value = 'resolved';\n", "utf8");
    const clean = await runEntry("post", event, { PLUGIN_ROOT: "/plugin" });
    assert.deepEqual({ code: clean.code, stdout: clean.stdout, stderr: clean.stderr }, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project config can downgrade a backup finding to report", async () => {
  const root = gitRoot("source-sanity-config-");
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, ".source-sanity-guard.mjs"), [
      "export default {",
      "  overrides: [{ match: /^src\\/reviewed\\//, checks: { backupArtifact: 'report' } }],",
      "};",
      "",
    ].join("\n"), "utf8");
    const result = await runEntry("pre", {
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: "src/reviewed/app.js.bak", content: "temporary" },
    });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
    assert.match(output.hookSpecificOutput.additionalContext, /\[Source Sanity Guard\]/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

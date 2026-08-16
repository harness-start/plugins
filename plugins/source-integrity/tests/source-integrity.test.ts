import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeGarbledText,
  CHECK_NAMES,
  isBackupArtifactPath,
  isBuiltInSkippedPath,
  modeFor,
  resolveConfig,
} from "../src/lib/source-sanity-policy.js";
import {
  extractFileTargets,
  extractInsertedText,
  extractPatchTargets,
} from "../src/entries/hooks/source-integrity.js";

const ENTRY = fileURLToPath(new URL("../dist/hooks/source-integrity.mjs", import.meta.url));

function runEntry(event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
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

test("config supports first matching per-check override and rejects invalid modes", () => {
  const warnings = [];
  const config = resolveConfig({
    checks: { backupArtifact: "report", garbledText: "invalid" },
    overrides: [
      { match: /^fixtures\//u, checks: { garbledText: "off" } },
      { match: /^fixtures\/strict\//u, checks: { garbledText: "block" } },
      { match: "src", checks: { backupArtifact: "off" } },
    ],
  }, (message) => warnings.push(message));
  assert.equal(config.checks.backupArtifact, "report");
  assert.equal(config.checks.garbledText, "block");
  assert.equal(modeFor("garbledText", "fixtures/strict/data.txt", config), "off");
  assert.equal(warnings.length, 2);
});

test("public policy and hook manifests no longer own merge conflict checks", () => {
  assert.deepEqual(CHECK_NAMES, ["backupArtifact", "garbledText"]);
  for (const relativePath of ["../hooks/claude.json", "../hooks/codex.json"]) {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"));
    assert.deepEqual(Object.keys(manifest.hooks), ["PreToolUse", "PostToolUse"]);
  }
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
  assert.deepEqual(extractFileTargets({
    cwd: "/repo",
    tool_name: "Bash",
    tool_input: { command: "printf x > src/app.js.bak" },
  }), ["/repo/src/app.js.bak"]);
});

test("create_file and search_replace extract and deny backup artifacts", async () => {
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "create_file",
      tool_input: { file_path: "src/app.js.bak" },
    }),
    ["/repo/src/app.js.bak"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "search_replace",
      tool_input: { path: "src/legacy.ts.orig" },
    }),
    ["/repo/src/legacy.ts.orig"],
  );

  for (const name of ["claude.json", "codex.json"]) {
    const hooks = JSON.parse(
      readFileSync(new URL(`../hooks/${name}`, import.meta.url), "utf8"),
    );
    const matcher = hooks.hooks.PreToolUse[0].matcher;
    assert.match(matcher, /create_file/u, name);
    assert.match(matcher, /search_replace/u, name);
  }

  const root = gitRoot("source-sanity-host-writers-");
  try {
    mkdirSync(join(root, "src"));
    const created = await runEntry({
      cwd: root,
      tool_name: "create_file",
      tool_input: { file_path: "src/app.js.bak", content: "temporary" },
    });
    assert.equal(
      JSON.parse(created.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
    const replaced = await runEntry({
      cwd: root,
      tool_name: "search_replace",
      tool_input: { path: "src/app.js.bak", old_string: "a", new_string: "b" },
    });
    assert.equal(
      JSON.parse(replaced.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
    const garbled = await runEntry({
      cwd: root,
      tool_name: "create_file",
      tool_input: { file_path: "src/app.js", content: "const value = '\uFFFD\uFFFD';" },
    });
    assert.equal(
      JSON.parse(garbled.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook denies shell writes of backup artifacts", async () => {
  const root = gitRoot("source-sanity-shell-backup-");
  try {
    mkdirSync(join(root, "src"));
    const result = await runEntry({
      cwd: root,
      tool_name: "Bash",
      tool_input: {
        command: "python3 -c \"open('src/app.js.bak','w').write('temporary')\"",
      },
    });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("shell copy, move, delete, and sed expose backup write targets", () => {
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "sed -i 's/x/y/' src/app.js.bak" },
    }),
    ["/repo/src/app.js.bak"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "timeout 5 sed -i.bak 's/x/y/' src/app.js.bak" },
    }),
    ["/repo/src/app.js.bak"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "cp /tmp/x src/app.js.bak" },
    }),
    ["/repo/src/app.js.bak"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "mv src/app.js.bak /tmp/old.bak" },
    }),
    ["/repo/src/app.js.bak", "/tmp/old.bak"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "rm -f src/app.js.bak" },
    }),
    ["/repo/src/app.js.bak"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "sed 's/x/y/' src/app.js.bak" },
    }),
    [],
  );
});

test("entry denies shell copy, move, delete, and sed of backup artifacts", async () => {
  const root = gitRoot("source-sanity-shell-writers-");
  try {
    mkdirSync(join(root, "src"));
    for (const command of [
      "sed -i 's/x/y/' src/app.js.bak",
      "cp /tmp/x src/app.js.bak",
      "mv src/app.js.bak /tmp/old.bak",
      "rm -f src/app.js.bak",
    ]) {
      const result = await runEntry({
        cwd: root,
        tool_name: "Bash",
        tool_input: { command },
      });
      assert.equal(
        JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
        "deny",
        command,
      );
    }
    const allowed = await runEntry({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "ls src" },
    });
    assert.equal(allowed.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry denies shell writes that insert replacement characters into source", async () => {
  const root = gitRoot("source-sanity-shell-garbled-");
  try {
    mkdirSync(join(root, "src"));
    const blocked = await runEntry({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "printf '\uFFFD\uFFFD' > src/app.js" },
    });
    assert.equal(
      JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
    assert.match(extractInsertedText({
      tool_name: "Bash",
      tool_input: { command: "printf '\uFFFD\uFFFD' > src/app.js" },
    }), /\uFFFD\uFFFD/u);
    const clean = await runEntry({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "printf ok > src/app.js" },
    });
    assert.equal(clean.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook denies backup artifacts before the file exists", async () => {
  const root = gitRoot("source-sanity-backup-");
  try {
    mkdirSync(join(root, "src"));
    const result = await runEntry({
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
    const blocked = await runEntry({
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: "src/app.js", new_string: "const value = '\uFFFD\uFFFD';" },
    });
    assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, "deny");
    const allowed = await runEntry({
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: "src/app.js", new_string: "const value = '\uFFFD';" },
    });
    assert.deepEqual({ code: allowed.code, stdout: allowed.stdout, stderr: allowed.stderr }, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project config can downgrade a backup finding to report", async () => {
  const root = gitRoot("source-sanity-config-");
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, ".source-integrity.mjs"), [
      "export default {",
      "  overrides: [{ match: /^src\\/reviewed\\//, checks: { backupArtifact: 'report' } }],",
      "};",
      "",
    ].join("\n"), "utf8");
    const result = await runEntry({
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

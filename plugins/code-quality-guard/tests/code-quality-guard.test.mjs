import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  capOutput,
  findExecutable,
  modeFor,
  resolveConfig,
} from "../scripts/lib/code-quality-core.mjs";
import { extractFileTargets } from "../scripts/code-quality-post.mjs";

const POST_ENTRY = fileURLToPath(new URL("../scripts/code-quality-post.mjs", import.meta.url));
const STOP_ENTRY = fileURLToPath(new URL("../scripts/code-quality-stop.mjs", import.meta.url));

function runEntry(entry, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry], {
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

function executable(path, body) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `#!/usr/bin/env bash\nset -eu\n${body}\n`, "utf8");
  chmodSync(path, 0o755);
}

test("config defaults block syntax, report lint, and accepts first matching overrides", () => {
  const config = resolveConfig({
    overrides: [
      { match: /^fixtures\//u, checks: { eslint: "off" } },
      { match: /^fixtures\/strict\//u, checks: { eslint: "block" } },
    ],
  });
  assert.equal(config.checks.javascriptSyntax, "block");
  assert.equal(config.checks.eslint, "report");
  assert.equal(modeFor("eslint", "fixtures/strict/app.js", config), "off");
});

test("invalid config values warn and preserve bounded defaults", () => {
  const warnings = [];
  const config = resolveConfig({
    checks: { phpSyntax: "warn" },
    limits: { maxImmediateFiles: 0, phpstanTimeoutMs: 999999 },
    missingTools: "always",
    overrides: [{ match: "src", checks: { eslint: "off" } }],
  }, (message) => warnings.push(message));
  assert.equal(config.checks.phpSyntax, "block");
  assert.equal(config.limits.maxImmediateFiles, 12);
  assert.equal(config.limits.phpstanTimeoutMs, 55000);
  assert.equal(config.missingTools, "report-once");
  assert.equal(warnings.length, 5);
});

test("file extraction covers direct, nested, patch, move, and ignores shell", () => {
  assert.deepEqual(extractFileTargets({
    cwd: "/repo",
    tool_name: "MultiEdit",
    tool_input: {
      file_path: "src/app.js",
      edits: [{ path: "src/lib.js" }],
      patch: "*** Add File: src/new.js\n*** Move to: src/moved.js",
    },
  }), ["/repo/src/app.js", "/repo/src/lib.js", "/repo/src/new.js", "/repo/src/moved.js"]);
  assert.deepEqual(extractFileTargets({
    cwd: "/repo",
    tool_name: "Bash",
    tool_input: { command: "echo bad > src/app.js" },
  }), []);
});

test("output capping preserves the limit and reports omitted lines", () => {
  const output = capOutput("one\ntwo\nthree\nfour", 2);
  assert.equal(output, "one\ntwo\n… 2 additional line(s) omitted");
});

test("local executable discovery precedes PATH", () => {
  const root = gitRoot("quality-executable-");
  try {
    const local = join(root, "node_modules", ".bin", "eslint");
    executable(local, "exit 0");
    assert.equal(findExecutable("eslint", root, ["node_modules/.bin/eslint"]), local);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("JavaScript syntax errors block after the write", async () => {
  const root = gitRoot("quality-js-syntax-");
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.js");
    writeFileSync(target, "const value = ;\n", "utf8");
    writeFileSync(join(root, ".code-quality-guard.mjs"), "export default { checks: { eslint: 'off' } };\n", "utf8");
    const result = await runEntry(POST_ENTRY, {
      cwd: root,
      session_id: "syntax",
      tool_name: "Write",
      tool_input: { file_path: target },
    }, { PLUGIN_ROOT: "/plugin" });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /JavaScript Syntax/u);
    assert.match(result.stderr, /blockingContract/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-Git directories use built-ins but do not load a cwd config", async () => {
  const root = mkdtempSync(join(tmpdir(), "quality-non-git-"));
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.js");
    writeFileSync(target, "const value = ;\n", "utf8");
    writeFileSync(join(root, ".code-quality-guard.mjs"), [
      "export default {",
      "  checks: { javascriptSyntax: 'off', eslint: 'off' },",
      "};",
      "",
    ].join("\n"), "utf8");
    const result = await runEntry(POST_ENTRY, {
      cwd: root,
      session_id: "non-git",
      tool_name: "Write",
      tool_input: { file_path: target },
    }, { PLUGIN_ROOT: "/plugin" });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /JavaScript Syntax/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary ESLint findings report without blocking", async () => {
  const root = gitRoot("quality-eslint-report-");
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.js");
    writeFileSync(target, "const value = 1;\n", "utf8");
    writeFileSync(join(root, "eslint.config.js"), "export default [];\n", "utf8");
    executable(join(root, "node_modules", ".bin", "eslint"), [
      "printf '%s\\n' '[{\"messages\":[{\"line\":1,\"column\":7,\"message\":\"unused value\",\"ruleId\":\"no-unused-vars\",\"fatal\":false}]}]'",
      "exit 1",
    ].join("\n"));
    const result = await runEntry(POST_ENTRY, {
      cwd: root,
      session_id: "eslint-report",
      tool_name: "Write",
      tool_input: { file_path: target },
    }, { PLUGIN_ROOT: "/plugin" });
    assert.equal(result.code, 0);
    assert.match(result.stderr, /\[report\] ESLint/u);
    assert.match(result.stderr, /no-unused-vars/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fatal ESLint parser findings block even when lint defaults to report", async () => {
  const root = gitRoot("quality-eslint-fatal-");
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.jsx");
    writeFileSync(target, "const view = <div />;\n", "utf8");
    writeFileSync(join(root, "eslint.config.js"), "export default [];\n", "utf8");
    executable(join(root, "node_modules", ".bin", "eslint"), [
      "printf '%s\\n' '[{\"messages\":[{\"line\":1,\"column\":1,\"message\":\"Parsing error\",\"fatal\":true}]}]'",
      "exit 1",
    ].join("\n"));
    const result = await runEntry(POST_ENTRY, {
      cwd: root,
      session_id: "eslint-fatal",
      tool_name: "Write",
      tool_input: { file_path: target },
    }, { PLUGIN_ROOT: "/plugin" });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /\[block\] ESLint/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing tools report once per session and workspace", async () => {
  const root = gitRoot("quality-missing-once-");
  const data = mkdtempSync(join(tmpdir(), "quality-state-"));
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.js");
    writeFileSync(target, "const value = 1;\n", "utf8");
    const event = {
      cwd: root,
      session_id: "same-session",
      tool_name: "Write",
      tool_input: { file_path: target },
    };
    const emptyPath = join(root, "empty-path");
    mkdirSync(emptyPath);
    const env = { PLUGIN_ROOT: "/plugin", PLUGIN_DATA: data, PATH: emptyPath };
    const first = await runEntry(POST_ENTRY, event, env);
    assert.equal(first.code, 0);
    assert.match(first.stderr, /ESLint was not found locally or on PATH/u);
    const second = await runEntry(POST_ENTRY, event, env);
    assert.equal(second.code, 0);
    assert.equal(second.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("PHP files persist for Stop and PHPStan report remains non-blocking", async () => {
  const root = gitRoot("quality-phpstan-report-");
  const data = mkdtempSync(join(tmpdir(), "quality-phpstan-state-"));
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "App.php");
    writeFileSync(target, "<?php\nfunction value(): int { return 1; }\n", "utf8");
    writeFileSync(join(root, ".code-quality-guard.mjs"), "export default { checks: { phpSyntax: 'off' } };\n", "utf8");
    writeFileSync(join(root, "phpstan.neon"), "parameters:\n  level: 5\n", "utf8");
    executable(join(root, "vendor", "bin", "phpstan"), "echo 'src/App.php:2: simulated issue'\nexit 1");
    const event = { cwd: root, session_id: "phpstan", tool_name: "Write", tool_input: { file_path: target } };
    const env = { PLUGIN_ROOT: "/plugin", PLUGIN_DATA: data };
    const post = await runEntry(POST_ENTRY, event, env);
    assert.equal(post.code, 0);
    const stop = await runEntry(STOP_ENTRY, { cwd: root, session_id: "phpstan" }, env);
    assert.equal(stop.code, 0);
    assert.match(stop.stderr, /PHPStan batch check results/u);
    assert.match(stop.stderr, /simulated issue/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("PHPStan can be configured as a Stop blocker", async () => {
  const root = gitRoot("quality-phpstan-block-");
  const data = mkdtempSync(join(tmpdir(), "quality-phpstan-block-state-"));
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "App.php");
    writeFileSync(target, "<?php\n", "utf8");
    writeFileSync(join(root, ".code-quality-guard.mjs"), "export default { checks: { phpSyntax: 'off', phpstan: 'block' } };\n", "utf8");
    writeFileSync(join(root, "phpstan.neon"), "parameters:\n  level: 5\n", "utf8");
    executable(join(root, "vendor", "bin", "phpstan"), "echo 'blocking issue'\nexit 1");
    const event = { cwd: root, session_id: "phpstan-block", tool_name: "Write", tool_input: { file_path: target } };
    const env = { PLUGIN_ROOT: "/plugin", PLUGIN_DATA: data };
    await runEntry(POST_ENTRY, event, env);
    const stop = await runEntry(STOP_ENTRY, { cwd: root, session_id: "phpstan-block" }, env);
    assert.equal(stop.code, 0);
    assert.equal(JSON.parse(stop.stdout).decision, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

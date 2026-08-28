import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const POST = fileURLToPath(
  new URL("../dist/hooks/cmd-safety-hook-post-tool.mjs", import.meta.url),
);

function runPostHook(event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [POST], {
      env: { ...process.env, PLUGIN_ROOT: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function createGitWorkspace(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const result = spawn("git", ["init"], { cwd: root, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    result.on("error", reject);
    result.on("close", (code) => {
      if (code === 0) resolve(root);
      else reject(new Error(`git init exited ${code}`));
    });
  });
}

test("PostToolUse report stays non-blocking when PLUGIN_ROOT is set", async () => {
  const root = await createGitWorkspace("cmd-safety-post-plugin-root-");
  try {
    writeFileSync(
      join(root, "unsafe.js"),
      "const agent = { rejectUnauthorized: false };\n",
    );

    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [POST], {
        env: { ...process.env, PLUGIN_ROOT: join(root, "plugin") },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(JSON.stringify({
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: "unsafe.js" },
      }));
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Insecure TLS/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post entry resolves relative write targets from the event cwd", async () => {
  const root = await createGitWorkspace("cmd-safety-post-relative-");
  try {
    writeFileSync(
      join(root, "unsafe.js"),
      "const agent = { rejectUnauthorized: false };\n",
    );

    const result = await runPostHook({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: "unsafe.js" },
    });

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.match(output.hookSpecificOutput.additionalContext, /Insecure TLS/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post entry falls back to defaults when config rules is not an array", async () => {
  const root = await createGitWorkspace("cmd-safety-post-config-");
  try {
    const source = join(root, "unsafe.js");
    writeFileSync(source, "const agent = { rejectUnauthorized: false };\n");
    writeFileSync(
      join(root, ".command-safety.mjs"),
      "export default { rules: {} };\n",
    );

    const result = await runPostHook({
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: source },
    });

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.match(output.hookSpecificOutput.additionalContext, /Insecure TLS/u);
    assert.match(result.stderr, /rules.*array/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

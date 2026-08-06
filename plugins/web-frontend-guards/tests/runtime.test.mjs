import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

function run(script, payload, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts", script)], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(JSON.stringify(payload));
  });
}

test("post entry reports invalid mini-program app config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "app.json");
    await writeFile(file, '{"pages":[]}\n');
    const result = await run("web-hook-post-tool.mjs", { cwd, tool_name: "Edit", tool_input: { file_path: file } }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /WeChat Mini Program Config/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("prompt entry reports actual frontend dependencies", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5.0", vite: "^7.0.0" } }));
    const result = await run("web-hook-user-prompt.mjs", { cwd, prompt: "inspect" }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Vue/u);
    assert.match(result.stdout, /Vite/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("clean non-frontend file exits without output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "notes.txt");
    await writeFile(file, "hello\n");
    const result = await run("web-hook-post-tool.mjs", { cwd, tool_name: "Edit", tool_input: { file_path: file } }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

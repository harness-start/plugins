import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { miscEnvironment } from "../scripts/checks/environment.mjs";

const pre = fileURLToPath(new URL("../scripts/misc-hook-pre-tool.mjs", import.meta.url));
const post = fileURLToPath(new URL("../scripts/misc-hook-post-tool.mjs", import.meta.url));
function run(entry, payload) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] }); const out = [], err = []; child.stdout.on("data", (chunk) => out.push(chunk)); child.stderr.on("data", (chunk) => err.push(chunk)); child.once("error", reject); child.once("close", (code) => resolve({ code, stdout: Buffer.concat(out).toString("utf8").trim(), stderr: Buffer.concat(err).toString("utf8") })); child.stdin.end(JSON.stringify(payload)); }); }

test("pre entry denies all generated lockfile families and Bundler bypass", async () => {
  const payloads = [
    { tool_name: "Write", tool_input: { file_path: "packages.lock.json" } },
    { tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch\n*** Update File: mix.lock\n+x\n*** End Patch" } },
    { tool_name: "exec_command", tool_input: { cmd: "printf x > flake.lock" } },
    { tool_name: "Bash", tool_input: { command: "tee renv.lock" } },
    { tool_name: "Shell", tool_input: { command: "bundle install --without-lock" } },
  ];
  for (const payload of payloads) { const result = await run(pre, payload); assert.equal(result.code, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(output.hookSpecificOutput.permissionDecision, "deny"); assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract/u); }
});

test("post entry reports C++ debug additions and encoding defects", async () => {
  const root = mkdtempSync(join(tmpdir(), "misc-guards-"));
  try {
    const cpp = join(root, "main.cpp"); writeFileSync(cpp, 'int main() { std::cerr << "debug"; return 0; }\n');
    const result = await run(post, { tool_name: "Write", tool_input: { file_path: cpp } });
    assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /Debug Statement/u);
    const ruby = join(root, "app.rb"); writeFileSync(ruby, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("puts :ok\n")]));
    const encoded = await run(post, { tool_name: "Write", tool_input: { file_path: ruby } }); assert.match(encoded.stdout, /Encoding Guard/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("environment detector consolidates Angular and Remotion package facts", () => {
  const root = mkdtempSync(join(tmpdir(), "misc-env-"));
  try {
    writeFileSync(join(root, "angular.json"), "{}\n");
    writeFileSync(join(root, "remotion.config.ts"), "export default {};\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "@angular/core": "20.0.0", typescript: "5.8.0", remotion: "4.0.0", "@remotion/cli": "4.0.0" } }));
    const report = miscEnvironment(root); assert.match(report, /Angular: 20\.0\.0/u); assert.match(report, /Package versions aligned: yes/u); assert.match(report, /Config file: found/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

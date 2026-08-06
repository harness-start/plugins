import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { mobileEnvironment } from "../scripts/checks/environment.mjs";

const pre = fileURLToPath(new URL("../scripts/mobile-hook-pre-tool.mjs", import.meta.url));
const post = fileURLToPath(new URL("../scripts/mobile-hook-post-tool.mjs", import.meta.url));

function run(entry, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(JSON.stringify(payload));
  });
}

test("pre entry denies direct and shell writes to generated mobile lockfiles", async () => {
  for (const payload of [
    { tool_name: "Write", tool_input: { file_path: "pubspec.lock" } },
    { tool_name: "exec_command", tool_input: { cmd: "printf x > ios/Package.resolved" } },
    { tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch\n*** Update File: Podfile.lock\n+x\n*** End Patch" } },
  ]) {
    const result = await run(pre, payload);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract/u);
  }
});

test("post entry reports Swift concurrency and ObjC observer risks", async () => {
  const root = mkdtempSync(join(tmpdir(), "mobile-guards-"));
  try {
    const swift = join(root, "Worker.swift");
    const objc = join(root, "Legacy.m");
    writeFileSync(swift, "func run() { Task.detached { await work() } }\n");
    writeFileSync(objc, "[center addObserver:self selector:@selector(change:) name:key object:nil];\n");
    for (const [file, pattern] of [[swift, /CC-CONC-001/u], [objc, /removeObserver/u]]) {
      const result = await run(post, { tool_name: "Write", tool_input: { file_path: file } });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, pattern);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("environment detector reads Android SDK and toolchain facts", () => {
  const root = mkdtempSync(join(tmpdir(), "android-env-"));
  try {
    writeFileSync(join(root, "settings.gradle.kts"), 'rootProject.name = "demo"\n');
    writeFileSync(join(root, "build.gradle.kts"), 'plugins { id("com.android.application") version "8.4.0" apply false; id("org.jetbrains.kotlin.android") version "2.0.0" apply false }\n');
    mkdirSync(join(root, "app"));
    writeFileSync(join(root, "app", "build.gradle.kts"), "android { compileSdk = 35; defaultConfig { minSdk = 24; targetSdk = 35 }; buildFeatures { compose = true } }\n");
    mkdirSync(join(root, "gradle", "wrapper"), { recursive: true });
    writeFileSync(join(root, "gradle", "wrapper", "gradle-wrapper.properties"), "distributionUrl=https://example.invalid/gradle-8.7-bin.zip\n");
    const report = mobileEnvironment(join(root, "app"));
    assert.match(report, /AGP: 8\.4\.0/u);
    assert.match(report, /Kotlin: 2\.0\.0/u);
    assert.match(report, /compileSdk: 35/u);
    assert.match(report, /Gradle: 8\.7/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

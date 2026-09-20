import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const pluginRoot = resolve(import.meta.dirname, "../..");
const entry = resolve(pluginRoot, "dist/cli/harness.mjs");
const providers = ["codex", "claude", "agy", "grok", "pi"] as const;

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function repository(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Delegation Test");
  git(root, "config", "user.email", "delegation@example.test");
  writeFileSync(join(root, "tracked.txt"), "committed\n");
  git(root, "add", "tracked.txt");
  git(root, "commit", "-qm", "initial");
  return root;
}

function fakeCodex(root: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const implementation = join(bin, "fake-codex.cjs");
  writeFileSync(implementation, `
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { basename } = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("codex-cli 0.0.0-offline\\n");
  process.exit(0);
}
writeFileSync(process.env.FAKE_WRITE_FILE, "written by fake codex\\n");
if (process.env.FAKE_STAGE === "1") {
  execFileSync("git", ["add", basename(process.env.FAKE_WRITE_FILE)], { cwd: process.cwd() });
}
const output = args.indexOf("-o");
if (output >= 0) writeFileSync(args[output + 1].replace(/^"(.*)"$/, "$1"), "offline fake report\\n");
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "offline-thread" }) + "\\n");
`);
  const executable = join(bin, "codex");
  writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${implementation}" "$@"\n`);
  chmodSync(executable, 0o755);
  writeFileSync(join(bin, "codex.cmd"), `@"${process.execPath}" "${implementation}" %*\r\n`);
  return bin;
}

function dispatchCodex(options: { stage?: boolean } = {}) {
  const root = repository("delegation-command-");
  const controls = mkdtempSync(join(tmpdir(), "delegation-controls-"));
  const bin = fakeCodex(controls);
  const outDir = join(controls, "relay-output");
  const brief = join(controls, "brief.txt");
  const delegated = join(root, "delegated.txt");
  writeFileSync(brief, "Create one delegated fixture and do not commit, stage, or push.\n");
  writeFileSync(join(root, "tracked.txt"), "dirty before delegation\n");
  const result = spawnSync(process.execPath, [
    entry,
    "delegate",
    "codex",
    "--brief",
    brief,
    "--cd",
    root,
    "--out-dir",
    outDir,
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PLUGIN_ROOT: pluginRoot,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_WRITE_FILE: delegated,
      FAKE_STAGE: options.stage ? "1" : "0",
    },
  });
  const relayResult = JSON.parse(readFileSync(join(outDir, "result.json"), "utf8")) as Record<string, unknown>;
  return { root, result, relayResult };
}

test("all bundled provider relays expose an offline help protocol without fleet lanes", () => {
  const helpByProvider = new Map<string, string>();
  for (const provider of providers) {
    const relay = resolve(pluginRoot, "skills", `${provider}-delegate`, "scripts/relay.mjs");
    const result = spawnSync(process.execPath, [relay, "--help"], { encoding: "utf8" });
    assert.equal(result.status, 0, `${provider}: ${result.stderr}`);
    assert.match(result.stdout, /--brief/u, provider);
    assert.match(result.stdout, /--cd/u, provider);
    assert.doesNotMatch(result.stdout, /--lane|delegate-setup/u, provider);
    helpByProvider.set(provider, result.stdout);
  }
  assert.match(helpByProvider.get("codex") ?? "", /--sandbox[\s\S]*--session[\s\S]*--clean-env/u);
  assert.match(helpByProvider.get("claude") ?? "", /--read-only[\s\S]*--dangerously-skip-permissions/u);
  assert.match(helpByProvider.get("agy") ?? "", /--sandbox[\s\S]*--read-only[\s\S]*--dangerously-skip-permissions/u);
  assert.match(helpByProvider.get("grok") ?? "", /--read-only[\s\S]*--full-access/u);
  assert.match(helpByProvider.get("pi") ?? "", /--approve[\s\S]*--read-only/u);
});

test("the public owner CLI accepts a dirty baseline and records non-attributed Git deltas", () => {
  const { result, relayResult } = dispatchCodex();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(relayResult.status, "completed");
  const audit = relayResult.harnessAudit as Record<string, unknown>;
  assert.equal(audit.schema, "harness-delegation.audit.v1");
  assert.equal(audit.protocolVerification, "offline");
  assert.equal(audit.liveProviderVerification, "unverified");
  assert.equal(audit.attribution, "unavailable");
  assert.deepEqual(audit.baselineTouchedFiles, ["tracked.txt"]);
  assert.deepEqual(audit.finalTouchedFiles, ["delegated.txt", "tracked.txt"]);
  assert.deepEqual(audit.changedSinceBaseline, ["delegated.txt"]);
  assert.equal(audit.headChanged, false);
  assert.equal(audit.indexChanged, false);
});

test("the public owner CLI fails a provider run that changes the Git index", () => {
  const { result, relayResult } = dispatchCodex({ stage: true });
  assert.equal(result.status, 1, result.stdout);
  assert.equal(relayResult.status, "failed");
  assert.match(String(relayResult.error), /must not commit or change the Git index/u);
  const audit = relayResult.harnessAudit as Record<string, unknown>;
  assert.equal(audit.providerStatus, "completed");
  assert.equal(audit.indexChanged, true);
});

test("the public owner CLI rejects fleet lanes and non-auditable Codex dispatch", () => {
  const root = repository("delegation-reject-");
  for (const args of [
    ["delegate", "codex", "--lane", "fast", "--cd", root],
    ["delegate", "codex", "--skip-git-repo-check", "--cd", root],
  ]) {
    const result = spawnSync(process.execPath, [entry, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PLUGIN_ROOT: pluginRoot },
    });
    assert.equal(result.status, 2, `${basename(args[2] ?? "")}: ${result.stderr}`);
  }
});

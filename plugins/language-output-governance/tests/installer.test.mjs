import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const INSTALLER = join(ROOT, "scripts", "install-all.sh");

function executable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function runInstaller(args, env = {}) {
  return spawnSync("bash", [INSTALLER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("installer rejects unsupported language profiles", () => {
  const result = runInstaller(["--language", "fr-FR", "--list-only"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--language must be zh-CN, en-US, ja-JP, ko-KR, or th-TH/u);
});

test("installer fallback exposes every marketplace plugin", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-fallback-"));
  const bin = join(fixture, "bin");
  const scripts = join(fixture, "scripts");
  const detachedInstaller = join(scripts, "install-all.sh");
  mkdirSync(bin, { recursive: true });
  mkdirSync(scripts, { recursive: true });
  executable(detachedInstaller, readFileSync(INSTALLER, "utf8"));
  for (const command of ["curl", "wget", "claude", "codex"]) {
    executable(join(bin, command), "#!/bin/sh\nexit 1\n");
  }

  try {
    const result = spawnSync("bash", [detachedInstaller, "--list-only", "--skip-skill-deps"], {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    const actual = result.stdout.trim().split("\n").filter(Boolean).sort();
    const marketplace = JSON.parse(
      readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"),
    );
    const expected = marketplace.plugins.map((plugin) => plugin.name).sort();
    assert.deepEqual(actual, expected);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer writes host-scoped language preferences", () => {
  const fixture = mkdtempSync(join(tmpdir(), "language-installer-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  const codexRoot = join(fixture, "codex");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "claude"), "#!/bin/sh\nprintf '[]\\n'\n");
  executable(join(bin, "codex"), "#!/bin/sh\nprintf '[]\\n'\n");

  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    CLAUDE_CONFIG_DIR: claudeRoot,
    CODEX_HOME: codexRoot,
  };

  try {
    const claude = runInstaller(
      ["--claude-only", "--skip-skill-deps", "--language", "en-US"],
      env,
    );
    assert.equal(claude.status, 0, claude.stderr);
    const claudePath = join(claudeRoot, "harness-start", "language-output-governance.json");
    assert.deepEqual(JSON.parse(readFileSync(claudePath, "utf8")), { defaultProfile: "en-US" });

    const codex = runInstaller(
      ["--codex-only", "--skip-skill-deps", "--language", "ja-JP"],
      env,
    );
    assert.equal(codex.status, 0, codex.stderr);
    const codexPath = join(codexRoot, "harness-start", "language-output-governance.json");
    assert.deepEqual(JSON.parse(readFileSync(codexPath, "utf8")), { defaultProfile: "ja-JP" });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

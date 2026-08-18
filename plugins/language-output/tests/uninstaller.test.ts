import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const UNINSTALLER = join(ROOT, "scripts", "uninstall-all.sh");

function executable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function preference(root: string): string {
  const directory = join(root, "harness-start");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "language-output.json");
  writeFileSync(path, '{"defaultProfile":"zh-CN"}\n');
  return path;
}

test("uninstaller removes both hosts, their marketplaces, and installer preferences", () => {
  const fixture = mkdtempSync(join(tmpdir(), "harness-uninstaller-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  const codexRoot = join(fixture, "codex");
  const claudeLog = join(fixture, "claude.log");
  const codexLog = join(fixture, "codex.log");
  mkdirSync(bin, { recursive: true });

  executable(join(bin, "claude"), `#!/bin/sh
printf '%s\\n' "$*" >> "${claudeLog}"
case "$*" in
  "plugin list --json")
    printf '%s\\n' '[{"id":"alpha@harness-start","marketplace":"harness-start"},{"id":"other@elsewhere","marketplace":"elsewhere"}]'
    ;;
  "plugin marketplace list --json")
    printf '%s\\n' '[{"name":"harness-start"}]'
    ;;
esac
`);
  executable(join(bin, "codex"), `#!/bin/sh
printf '%s\\n' "$*" >> "${codexLog}"
case "$*" in
  "plugin list --marketplace harness-start --json")
    printf '%s\\n' '{"installed":[{"name":"gamma","marketplaceName":"harness-start","installed":true},{"name":"other","marketplaceName":"elsewhere","installed":true}]}'
    ;;
  "plugin marketplace list --json")
    printf '%s\\n' '{"marketplaces":[{"name":"harness-start"}]}'
    ;;
esac
`);

  const claudePreference = preference(claudeRoot);
  const codexPreference = preference(codexRoot);

  try {
    const result = spawnSync("bash", [UNINSTALLER], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: claudeRoot,
        CODEX_HOME: codexRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(claudeLog, "utf8"), /plugin uninstall alpha@harness-start --scope user --yes/u);
    assert.match(readFileSync(claudeLog, "utf8"), /plugin marketplace remove harness-start --scope user/u);
    assert.doesNotMatch(readFileSync(claudeLog, "utf8"), /other@elsewhere/u);
    assert.match(readFileSync(codexLog, "utf8"), /plugin remove gamma@harness-start --json/u);
    assert.match(readFileSync(codexLog, "utf8"), /plugin marketplace remove harness-start --json/u);
    assert.doesNotMatch(readFileSync(codexLog, "utf8"), /remove other@/u);
    assert.equal(existsSync(claudePreference), false);
    assert.equal(existsSync(codexPreference), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("uninstaller dry-run preserves files and prints planned Claude commands", () => {
  const fixture = mkdtempSync(join(tmpdir(), "harness-uninstaller-dry-run-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "claude"), `#!/bin/sh
case "$*" in
  "plugin list --json") printf '%s\\n' '[{"id":"alpha@harness-start","marketplace":"harness-start"}]' ;;
  "plugin marketplace list --json") printf '%s\\n' '[{"name":"harness-start"}]' ;;
esac
`);
  const path = preference(claudeRoot);

  try {
    const result = spawnSync("bash", [UNINSTALLER, "--claude-only", "--dry-run"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: claudeRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /plugin uninstall alpha@harness-start --scope user --yes/u);
    assert.match(result.stderr, /plugin marketplace remove harness-start --scope user/u);
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("uninstaller fails closed when marketplace state cannot be read", () => {
  const fixture = mkdtempSync(join(tmpdir(), "harness-uninstaller-marketplace-failure-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "claude"), `#!/bin/sh
case "$*" in
  "plugin list --json") printf '%s\\n' '[]' ;;
  "plugin marketplace list --json") exit 1 ;;
esac
`);
  const path = preference(claudeRoot);

  try {
    const result = spawnSync("bash", [UNINSTALLER, "--claude-only"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: claudeRoot,
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /unable to list marketplaces/u);
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("uninstaller fails closed when marketplace state is malformed", () => {
  const fixture = mkdtempSync(join(tmpdir(), "harness-uninstaller-marketplace-malformed-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "claude"), `#!/bin/sh
case "$*" in
  "plugin list --json") printf '%s\\n' '[]' ;;
  "plugin marketplace list --json") printf '%s\\n' '{not-json' ;;
esac
`);
  const path = preference(claudeRoot);

  try {
    const result = spawnSync("bash", [UNINSTALLER, "--claude-only"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: claudeRoot,
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /unable to parse marketplace state/u);
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("uninstaller only removes Claude plugins from the requested scope", () => {
  const fixture = mkdtempSync(join(tmpdir(), "harness-uninstaller-scope-"));
  const bin = join(fixture, "bin");
  const claudeLog = join(fixture, "claude.log");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "claude"), `#!/bin/sh
printf '%s\\n' "$*" >> "${claudeLog}"
case "$*" in
  "plugin list --json")
    printf '%s\\n' '[{"id":"user-plugin@harness-start","marketplace":"harness-start","scope":"user"},{"id":"local-plugin@harness-start","marketplace":"harness-start","scope":"local"}]'
    ;;
  "plugin marketplace list --json") printf '%s\\n' '[]' ;;
esac
`);

  try {
    const result = spawnSync("bash", [UNINSTALLER, "--claude-only", "--scope", "local"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: join(fixture, "claude"),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(claudeLog, "utf8");
    assert.match(log, /plugin uninstall local-plugin@harness-start --scope local --yes/u);
    assert.doesNotMatch(log, /plugin uninstall user-plugin@/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const INSTALLER = join(ROOT, "scripts", "install-all.sh");

function executable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function writeMarketplace(root) {
  const metadataRoot = join(root, ".claude-plugin");
  mkdirSync(metadataRoot, { recursive: true });
  writeFileSync(
    join(metadataRoot, "marketplace.json"),
    JSON.stringify({
      name: "harness-start",
      plugins: [{ name: "current-plugin", source: "./plugins/current-plugin" }],
    }),
  );
}

function runInstaller(fixture, args, env) {
  return spawnSync("bash", [INSTALLER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
      ...env,
    },
  });
}

test("Claude removes a retired marketplace plugin hidden from plugin list", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-claude-orphan-"));
  const bin = join(fixture, "bin");
  const marketplace = join(fixture, "marketplace");
  const claudeRoot = join(fixture, "claude");
  const commandLog = join(fixture, "claude.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(claudeRoot, "plugins"), { recursive: true });
  writeMarketplace(marketplace);
  writeFileSync(
    join(claudeRoot, "plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "retired-plugin@harness-start": [{ scope: "user" }],
        "current-plugin@harness-start": [{ scope: "user" }],
        "project-only-plugin@harness-start": [{ scope: "project" }],
      },
    }),
  );
  executable(
    join(bin, "claude"),
    `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(commandLog)}
case "$*" in
  "plugin list --json")
    printf '%s\\n' '[{"id":"current-plugin@harness-start","name":"current-plugin","marketplace":"harness-start"}]'
    ;;
esac
exit 0
`,
  );

  try {
    const result = runInstaller(
      fixture,
      ["--local", marketplace, "--claude-only",  "--language", "en-US"],
      { CLAUDE_CONFIG_DIR: claudeRoot },
    );

    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(commandLog, "utf8");
    assert.match(commands, /plugin uninstall retired-plugin@harness-start -s user/u);
    assert.doesNotMatch(commands, /project-only-plugin@harness-start/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Codex removes a retired marketplace plugin hidden from plugin list", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-codex-orphan-"));
  const bin = join(fixture, "bin");
  const marketplace = join(fixture, "marketplace");
  const codexRoot = join(fixture, "codex");
  const commandLog = join(fixture, "codex.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(
    join(codexRoot, "config.toml"),
    `[plugins."retired-plugin@harness-start"]
enabled = true

[plugins."current-plugin@harness-start"]
enabled = true

[plugins."unrelated-plugin@another-marketplace"]
enabled = true
`,
  );
  writeMarketplace(marketplace);
  executable(
    join(bin, "codex"),
    `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(commandLog)}
case "$*" in
  "plugin list --marketplace harness-start --json")
    printf '%s\\n' '{"installed":[{"pluginId":"current-plugin@harness-start","name":"current-plugin","installed":true}],"available":[]}'
    ;;
esac
exit 0
`,
  );

  try {
    const result = runInstaller(
      fixture,
      ["--local", marketplace, "--codex-only",  "--language", "en-US"],
      { CODEX_HOME: codexRoot },
    );

    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(commandLog, "utf8");
    assert.match(commands, /plugin remove retired-plugin@harness-start --json/u);
    assert.doesNotMatch(commands, /unrelated-plugin@another-marketplace/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

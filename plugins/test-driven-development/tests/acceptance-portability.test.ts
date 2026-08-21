import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { commandsFor, eventNames, readHookManifest } from "../../../core/tests/support/hook-manifest.js";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const COMMON = join(REPO, "scripts", "acceptance", "lib", "common.sh");
const PROJECT_COMMON = join(REPO, "scripts", "acceptance", "lib", "project-common.sh");
const HOOKS = join(REPO, "plugins", "test-driven-development", "hooks");

function portableFindPath(root) {
  const actualFind = execFileSync("sh", ["-c", "command -v find"], { encoding: "utf8" }).trim();
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const shim = join(bin, "find");
  writeFileSync(shim, [
    "#!/usr/bin/env bash",
    "for arg in \"$@\"; do",
    "  if [ \"$arg\" = \"-printf\" ]; then exit 64; fi",
    "done",
    `exec ${JSON.stringify(actualFind)} "$@"`,
    "",
  ].join("\n"));
  chmodSync(shim, 0o755);
  return bin;
}

test("acceptance discovery works without GNU find -printf", () => {
  const root = mkdtempSync(join(tmpdir(), "acceptance-portable-find-"));
  const plugin = join(root, "plugin");
  const scenarios = join(root, "scenarios");
  mkdirSync(join(plugin, "acceptance", "cases", "02-second"), { recursive: true });
  mkdirSync(join(plugin, "acceptance", "cases", "01-first"), { recursive: true });
  mkdirSync(join(scenarios, "domain", "cases", "case-a"), { recursive: true });
  const env = { ...process.env, PATH: `${portableFindPath(root)}:${process.env.PATH}`, COMMON, PROJECT_COMMON, PLUGIN: plugin, SCENARIOS: scenarios };
  const cases = spawnSync("bash", ["-c", '. "$COMMON"; list_cases "$PLUGIN"'], { env, encoding: "utf8" });
  assert.equal(cases.status, 0, cases.stderr);
  assert.equal(cases.stdout, "01-first\n02-second\n");
  const project = spawnSync("bash", ["-c", '. "$PROJECT_COMMON"; list_project_cases "$SCENARIOS"'], { env, encoding: "utf8" });
  assert.equal(project.status, 0, project.stderr);
  assert.equal(project.stdout, "domain/case-a\n");
});

test("TDD installs a SessionStart file-order reminder and a PreToolUse guard on both platforms", () => {
  const claude = readHookManifest(join(HOOKS, "claude.json"));
  const codex = readHookManifest(join(HOOKS, "codex.json"));
  assert.deepEqual(eventNames(claude), ["PreToolUse", "SessionStart"]);
  assert.deepEqual(eventNames(codex), ["PreToolUse", "SessionStart"]);

  const claudeSession = commandsFor(claude, "SessionStart");
  const codexSession = commandsFor(codex, "SessionStart");
  assert.equal(claudeSession.length, 1);
  assert.equal(codexSession.length, 1);
  assert.match(claudeSession[0].command, /test-driven-development\.mjs" session-start claude/u);
  assert.match(codexSession[0].command, /AI_EXPERTS_TRIGGER_FROM="test-driven-development:session-start".*session-start codex/u);

  const claudePre = commandsFor(claude, "PreToolUse");
  const codexPre = commandsFor(codex, "PreToolUse");
  assert.equal(claudePre.length, 1);
  assert.equal(codexPre.length, 1);
  assert.match(claudePre[0].command, /test-driven-development\.mjs" pre claude/u);
  assert.match(codexPre[0].command, /AI_EXPERTS_SESSION_ID=.*AI_EXPERTS_TRIGGER_FROM=.*test-driven-development\.mjs" pre codex/u);
});

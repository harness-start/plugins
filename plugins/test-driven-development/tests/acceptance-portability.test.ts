import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

test("TDD installs only a PreToolUse file-order guard on both platforms", () => {
  const claude = JSON.parse(readFileSync(join(HOOKS, "claude.json"), "utf8"));
  const codex = JSON.parse(readFileSync(join(HOOKS, "codex.json"), "utf8"));
  assert.deepEqual(Object.keys(claude.hooks), ["PreToolUse"]);
  assert.deepEqual(Object.keys(codex.hooks), ["PreToolUse"]);
  assert.match(claude.hooks.PreToolUse[0].hooks[0].command, /test-driven-development\.mjs" pre claude/u);
  assert.match(codex.hooks.PreToolUse[0].hooks[0].command, /AI_EXPERTS_SESSION_ID=.*AI_EXPERTS_TRIGGER_FROM=.*test-driven-development\.mjs" pre codex/u);
});

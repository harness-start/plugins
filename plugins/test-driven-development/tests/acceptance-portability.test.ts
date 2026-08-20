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
const CASES = join(REPO, "plugins", "test-driven-development", "acceptance", "cases");
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

test("TDD live cases follow the stateless test-first contract", () => {
  const allowPrompt = readFileSync(join(CASES, "02-allow-test-first", "prompt.md"), "utf8");
  const allowExpect = readFileSync(join(CASES, "02-allow-test-first", "expect.sh"), "utf8");
  const identityPrompt = readFileSync(join(CASES, "03-same-name-identity", "prompt.md"), "utf8");
  const identityExpect = readFileSync(join(CASES, "03-same-name-identity", "expect.sh"), "utf8");
  assert.match(allowPrompt, /create .*test.*Then create .*src/is);
  assert.match(allowExpect, /test ! -e .*\.test-driven-development/su);
  assert.doesNotMatch(allowExpect, /state|lastRed|\.version/u);
  assert.match(identityPrompt, /wrong.*blocked.*correct/isu);
  assert.match(identityExpect, /src\/shipping\/order-service\.mjs/u);
  assert.match(identityExpect, /src\/billing\/order-service\.mjs/u);
  const historicalPrompt = readFileSync(join(CASES, "05-historical-fix-allow", "prompt.md"), "utf8");
  const deletePrompt = readFileSync(join(CASES, "06-feature-delete", "prompt.md"), "utf8");
  assert.match(historicalPrompt, /First update the existing/iu);
  assert.match(historicalPrompt, /separate test and implementation edits/iu);
  assert.match(deletePrompt, /Delete the existing test file first/u);
  assert.doesNotMatch(deletePrompt, /do not run tests/iu);
  for (const id of ["04-historical-test-first", "05-historical-fix-allow", "06-feature-delete"]) {
    assert.doesNotMatch(readFileSync(join(CASES, id, "expect.sh"), "utf8"), /state|lastRed|Recorded test-first evidence/u);
  }
});

test("TDD installs only a PreToolUse file-order guard on both platforms", () => {
  const claude = JSON.parse(readFileSync(join(HOOKS, "claude.json"), "utf8"));
  const codex = JSON.parse(readFileSync(join(HOOKS, "codex.json"), "utf8"));
  assert.deepEqual(Object.keys(claude.hooks), ["PreToolUse"]);
  assert.deepEqual(Object.keys(codex.hooks), ["PreToolUse"]);
  assert.match(claude.hooks.PreToolUse[0].hooks[0].command, /test-driven-development\.mjs" pre claude/u);
  assert.match(codex.hooks.PreToolUse[0].hooks[0].command, /AI_EXPERTS_SESSION_ID=.*AI_EXPERTS_TRIGGER_FROM=.*test-driven-development\.mjs" pre codex/u);
});

test("host-side acceptance stays compatible with macOS Bash 3.2 and offline honesty", () => {
  const paths = [
    join(REPO, "scripts", "acceptance", "run.sh"),
    join(REPO, "scripts", "acceptance", "run-project.sh"),
    join(REPO, "scripts", "acceptance", "check-expect-honesty.sh"),
    COMMON,
  ];
  const sources = paths.map((path) => readFileSync(path, "utf8"));
  assert.doesNotMatch(sources.join("\n"), /\bmapfile\b/u);
  assert.doesNotMatch(readFileSync(COMMON, "utf8"), /grep[^\n]*\\s/u);
  for (const source of sources.slice(0, 2)) {
    assert.ok(source.indexOf('if [ "${HONESTY_ONLY}" -eq 1 ]') < source.indexOf('load_env_file "${REPO_ROOT}"'));
  }
});

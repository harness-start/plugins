import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";

const REPO = fileURLToPath(new URL("../../../../..", import.meta.url));
const COMMON = join(REPO, "scripts", "acceptance", "lib", "common.sh");
const PROJECT_COMMON = join(REPO, "scripts", "acceptance", "lib", "project-common.sh");

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
  for (const host of ["claude", "codex"] as const) {
    const routes = readModuleRoutes(import.meta.url, host, "testing");
    assert.deepEqual(Object.keys(routes).sort(), ["PreToolUse", "SessionStart"]);
    assert.equal(routes.SessionStart.length, 1);
    assert.equal(routes.PreToolUse.length, 1);
    assert.equal(routes.SessionStart[0].script, "dist/hooks/test-driven-development.mjs");
    assert.deepEqual(routes.SessionStart[0].args, ["session-start", host]);
    assert.equal(routes.PreToolUse[0].script, "dist/hooks/test-driven-development.mjs");
    assert.deepEqual(routes.PreToolUse[0].args, ["pre", host]);
  }
});

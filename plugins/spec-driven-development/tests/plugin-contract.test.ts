import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("manifests expose five bundled skills and artifact-only hooks", () => {
  for (const platform of [".claude-plugin", ".codex-plugin"]) {
    const manifest = JSON.parse(readFileSync(join(ROOT, platform, "plugin.json"), "utf8"));
    assert.equal(manifest.name, "spec-driven-development");
    assert.equal(manifest.version, "0.2.0");
    assert.equal(manifest.skills, "./skills/");
    assert.match(manifest.description, /recognized|identified/iu);
    assert.doesNotMatch(manifest.description, /deterministically protects/iu);
  }
  const names = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(names, ["sdd", "sdd-build", "sdd-plan", "sdd-specify", "sdd-tasks"]);

  for (const host of ["claude", "codex"]) {
    const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", `${host}.json`), "utf8")).hooks;
    assert.deepEqual(Object.keys(hooks), ["PreToolUse", "PostToolUse"]);
    assert.equal(Object.hasOwn(hooks, "SessionStart"), false);
    assert.equal(Object.hasOwn(hooks, "Stop"), false);
  }
});

test("skills define parent-owned context hygiene and bounded delegation", () => {
  const all = ["sdd", "sdd-specify", "sdd-plan", "sdd-tasks", "sdd-build"]
    .map((name) => readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8")).join("\n");
  assert.match(all, /fork_turns.*none/iu);
  assert.match(all, /Do not spawn an implementer[\s\S]*only subagent/iu);
  assert.match(all, /maximum concurrency.*2/iu);
  assert.match(all, /no nested delegation/iu);
  assert.match(all, /Task Brief/iu);
  assert.match(all, /Result Card/iu);
  assert.match(all, /brief-id/iu);
  assert.match(all, /one short.*wait/iu);
  assert.match(all, /spawn.*does not prove|spawn.*not prove/iu);
  assert.match(all, /unexpected descendants/iu);
  assert.match(all, /discard|Reject results/iu);
  assert.match(all, /byte-for-byte/iu);
  assert.match(all, /prefix, suffix, blank line, duplicate card/iu);
  assert.match(all, /4 KiB/iu);
  assert.match(all, /single-agent fallback/iu);
  assert.match(all, /parent.*rerun.*Verify/isu);
  assert.doesNotMatch(all, /subagents? (?:guarantee|ensure|prove) (?:better|higher)/iu);
});

test("plugin ships Docker acceptance cases for control, recovery, isolation, and resume", () => {
  for (const name of [
    "01-ordinary-bypass",
    "02-artifact-order-recovery",
    "03-stale-upstream-recovery",
    "04-multi-task-context-isolation",
    "05-resume-from-artifacts",
    "06-review-and-scope-defense",
  ]) {
    assert.equal(existsSync(join(ROOT, "acceptance", "cases", name, "case.toml")), true, name);
    assert.equal(existsSync(join(ROOT, "acceptance", "cases", name, "prompt.md")), true, name);
    assert.equal(existsSync(join(ROOT, "acceptance", "cases", name, "expect.sh")), true, name);
    const result = spawnSync("bash", ["-c", '. "$COMMON"; read_case_hosts "$CASE"'], {
      encoding: "utf8",
      env: {
        ...process.env,
        CASE: join(ROOT, "acceptance", "cases", name),
        COMMON: join(ROOT, "..", "..", "scripts", "acceptance", "lib", "common.sh"),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(new Set(result.stdout.trim().split(/\s+/u)), new Set(["claude", "codex"]), name);
  }
});

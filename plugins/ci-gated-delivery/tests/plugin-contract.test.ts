import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));

function json(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

test("plugin exposes one delivery skill without duplicate Git hooks", () => {
  const codex = json(".codex-plugin/plugin.json");
  const claude = json(".claude-plugin/plugin.json");

  assert.equal(codex.name, "ci-gated-delivery");
  assert.equal(claude.name, codex.name);
  assert.equal(codex.version, "0.2.0");
  assert.equal(claude.version, codex.version);
  assert.equal(codex.skills, "./skills/");
  assert.equal(claude.skills, codex.skills);
  assert.equal(Object.hasOwn(codex, "hooks"), false);
  assert.equal(Object.hasOwn(claude, "hooks"), false);
  assert.equal(existsSync(join(ROOT, "hooks")), false);
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), true);
  assert.deepEqual(json("skill-deps.json").skills.map(({ name }) => name), [
    "requesting-code-review",
    "verification-before-completion",
    "finishing-a-development-branch",
  ]);

  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(skillNames, ["ci-gated-mr-workflow"]);
});

test("delivery skill owns review, CI supervision, merge, and cleanup in one state machine", () => {
  const skill = readFileSync(
    join(ROOT, "skills", "ci-gated-mr-workflow", "SKILL.md"),
    "utf8",
  );

  for (const stage of [
    "Scope",
    "Classify",
    "Branch",
    "Local loop",
    "Commit and publish",
    "Review",
    "Supervise CI",
    "Gate merge",
    "Post-merge decision",
    "Finish",
  ]) {
    assert.match(skill, new RegExp(`\\*\\*${stage}\\*\\*`, "u"), stage);
  }
  assert.match(skill, /structured tool or API output bound to the current head SHA/iu);
  assert.match(skill, /maximum attempts or deadline/iu);
  assert.match(skill, /query failures, not pending CI/iu);
  assert.match(skill, /remote mutation needs a subsequent read/iu);
  assert.match(skill, /ships no Stop Hook/iu);
  assert.doesNotMatch(
    skill,
    /\$(?:code-review-loop|development-branch-finish|gitlab-delivery-supervisor)/u,
  );

  const handoff = readFileSync(
    join(ROOT, "skills", "ci-gated-mr-workflow", "references", "reviewer-handoff.md"),
    "utf8",
  );
  for (const field of [
    "Objective:",
    "Non-goals:",
    "Allowed files:",
    "Base:",
    "Head:",
    "Verification evidence:",
    "Forbidden context:",
    "Severity:",
    "File anchor:",
    "Concrete evidence:",
    "Verifiable fix or recovery:",
  ]) {
    assert.match(handoff, new RegExp(field, "u"), field);
  }
  assert.match(handoff, /never (?:send|include).*full (?:conversation|transcript)/iu);
  assert.match(skill, /references\/reviewer-handoff\.md/u);
});

test("both marketplace indexes publish the plugin once", () => {
  const paths = [
    join(REPO, ".agents", "plugins", "marketplace.json"),
    join(REPO, ".claude-plugin", "marketplace.json"),
  ];

  for (const path of paths) {
    const marketplace = JSON.parse(readFileSync(path, "utf8"));
    const entries = marketplace.plugins.filter(
      (entry) => entry.name === "ci-gated-delivery",
    );
    assert.equal(entries.length, 1, path);
  }
});

test("plugin ships dual-host acceptance for remote-state boundaries and reviewer handoff", () => {
  for (const name of [
    "01-ordinary-bypass",
    "02-no-fabricated-remote-success",
    "03-query-failure-stops",
    "04-stale-head-success",
    "05-unresolved-discussion",
    "06-default-branch-failure",
    "07-current-head-success",
    "08-scoped-reviewer-handoff",
  ]) {
    const root = join(ROOT, "acceptance", "cases", name);
    for (const file of ["case.toml", "prompt.md", "expect.sh"]) {
      assert.equal(existsSync(join(root, file)), true, `${name}/${file}`);
    }
    assert.match(
      readFileSync(join(root, "case.toml"), "utf8"),
      /hosts\s*=\s*\["claude",\s*"codex"\]/u,
    );
  }
});

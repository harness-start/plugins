import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("manifests expose five bundled skills and artifact-only hooks", () => {
  for (const platform of [".claude-plugin", ".codex-plugin"]) {
    const manifest = JSON.parse(readFileSync(join(ROOT, platform, "plugin.json"), "utf8"));
    assert.equal(manifest.name, "sdd-workflow");
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
    assert.match(readFileSync(join(ROOT, "acceptance", "cases", name, "case.toml"), "utf8"), /hosts\s*=\s*\["claude",\s*"codex"\]/u, name);
  }
  const isolationOracle = [
    readFileSync(join(ROOT, "acceptance", "cases", "04-multi-task-context-isolation", "expect.sh"), "utf8"),
    readFileSync(join(ROOT, "acceptance", "lib", "codex-wait-receipt.jq"), "utf8"),
  ].join("\n");
  assert.match(isolationOracle, /timeout_ms\s*==\s*10000/u);
  assert.match(isolationOracle, /function_call_output|tool_result/u);
  assert.match(isolationOracle, /Tool-Policy: FORBID_ALL_TOOLS/u);
  const isolationPrompt = readFileSync(
    join(ROOT, "acceptance", "cases", "04-multi-task-context-isolation", "prompt.md"),
    "utf8",
  );
  assert.match(isolationPrompt, /may add one blank line after the `Task Brief` heading/u);
  assert.match(isolationPrompt, /may append only the lane-specific sentence “Return exactly the line/u);
  assert.match(isolationPrompt, /Codex create that file only with one exact `apply_patch` Add File/u);
  assert.match(isolationOracle, /expected_orchard_brief/u);
  assert.match(isolationOracle, /\.message == \$orchard/u);
  assert.match(isolationOracle, /encrypted_content[\s\S]*== \[\$expected\]/u);
  assert.match(isolationOracle, /worker_messages[\s\S]*-eq 2/u);
  assert.match(isolationOracle, /test .*wait_timed_out.*=.*false/u);
  assert.match(isolationOracle, /assistant_text_count/u);
  assert.match(isolationOracle, /child_user_prompt_count/u);
  assert.match(isolationOracle, /\(\$deliveries \| length\) == 1/u);
  assert.match(isolationOracle, /child_structure_violations/u);
  assert.doesNotMatch(isolationOracle, /\| last \/\/ ""/u);
  assert.match(isolationOracle, /\.prompt == \$orchard or \.prompt == \$orchardAccepted/u);
  assert.match(isolationOracle, /orchardSpacedBase/u);
  assert.match(isolationOracle, /orchardSpacedCompact/u);

  const ordinaryOracle = readFileSync(join(ROOT, "acceptance", "cases", "01-ordinary-bypass", "expect.sh"), "utf8");
  assert.match(ordinaryOracle, /ACCEPT_HOST.*claude[\s\S]*agent_count[\s\S]*-eq 0/iu);

  const reviewOracle = readFileSync(join(ROOT, "acceptance", "cases", "06-review-and-scope-defense", "expect.sh"), "utf8");
  assert.match(reviewOracle, /\.fork_turns[\s\S]*"none"/u);
  assert.match(reviewOracle, /brief-id=formatter-review-001/u);
  assert.match(reviewOracle, /descendant_count/u);
  assert.match(reviewOracle, /reviewer_mutation_calls/u);
  assert.match(reviewOracle, /verification_before_review/u);
  assert.match(reviewOracle, /agent_prompt.*==.*expected_brief/u);
  assert.match(reviewOracle, /review_prompt.*==.*expected_brief/u);
  assert.match(reviewOracle, /encrypted_content[\s\S]*== \[\$expected\]/u);
  assert.match(reviewOracle, /review_messages[\s\S]*-eq 1/u);
  assert.match(reviewOracle, /expected_transport/u);
  assert.match(reviewOracle, /spawn_contract_valid/u);
  assert.match(reviewOracle, /child_card_valid/u);
  assert.match(reviewOracle, /agent_receipt_total/u);
  assert.match(reviewOracle, /\(\$deliveries \| length\) == 1/u);
  assert.doesNotMatch(reviewOracle, /\| last \/\/ ""/u);
  assert.doesNotMatch(reviewOracle, /normalized_child_card/u);
});

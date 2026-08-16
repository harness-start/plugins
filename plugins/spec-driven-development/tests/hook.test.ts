import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { digestText } from "../src/lib/artifacts.js";
import { evaluateHook } from "../src/entries/hooks/spec-driven-development-hook.js";

const SPEC = `# Spec: Greeting
## Intent
Return a greeting.
## Requirements
### REQ-001: Greet
Return a stable greeting.
#### Scenario: greeting
- Given a caller
- When greeting is requested
- Then hello is returned
## Non-goals
- Localization.
`;

function plan(spec = SPEC) {
  return `# Plan: Greeting
Spec-Digest: sha256:${digestText(spec)}
## Approach
Implement REQ-001 directly.
## Change Surface
- src/greet.js
## Risks
- None.
## Validation
- Run greeting tests.
`;
}

function event(cwd, target, toolName = "Write") {
  return { cwd, tool_name: toolName, tool_input: { file_path: target, content: "next" } };
}

test("ordinary source writes and near-miss paths bypass the gate", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-bypass-"));
  assert.equal(evaluateHook("pre", event(root, join(root, "src", "plan.md"))), null);
  assert.equal(evaluateHook("pre", event(root, join(root, ".specs", "001-x", "planner.md"))), null);
  assert.equal(evaluateHook("pre", event(root, join(root, "fixtures", ".specs", "001-x", "plan.md"))), null);
});

test("plan write is denied until its sibling spec is valid", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-plan-"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  const target = join(change, "plan.md");
  assert.equal(evaluateHook("pre", event(root, target))?.hookSpecificOutput?.permissionDecision, "deny");
  writeFileSync(join(change, "spec.md"), SPEC);
  assert.equal(evaluateHook("pre", event(root, target)), null);
});

test("pre hook rejects invalid change paths and symlink artifact targets", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-paths-"));
  const invalid = join(root, ".specs", "greeting");
  mkdirSync(invalid, { recursive: true });
  assert.equal(evaluateHook("pre", event(root, join(invalid, "spec.md")))?.hookSpecificOutput?.permissionDecision, "deny");

  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), SPEC);
  const external = join(root, "external-plan.md");
  writeFileSync(external, plan());
  symlinkSync(external, join(change, "plan.md"));
  assert.equal(evaluateHook("pre", event(root, join(change, "plan.md")))?.hookSpecificOutput?.permissionDecision, "deny");

  symlinkSync(".", join(root, "alias"));
  assert.equal(
    evaluateHook("pre", event(root, join(root, "alias", ".specs", "greeting", "spec.md")))?.hookSpecificOutput?.permissionDecision,
    "deny",
  );
});

test("tasks write is denied when plan is missing or stale and recovers after rewrite", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-tasks-"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), SPEC);
  const target = join(change, "tasks.md");
  assert.equal(evaluateHook("pre", event(root, target))?.hookSpecificOutput?.permissionDecision, "deny");
  writeFileSync(join(change, "plan.md"), plan());
  assert.equal(evaluateHook("pre", event(root, target)), null);
  writeFileSync(join(change, "spec.md"), SPEC.replace("stable greeting", "friendly greeting"));
  assert.equal(evaluateHook("pre", event(root, target))?.hookSpecificOutput?.permissionDecision, "deny");
  writeFileSync(join(change, "plan.md"), plan(SPEC.replace("stable greeting", "friendly greeting")));
  assert.equal(evaluateHook("pre", event(root, target)), null);
});

test("nested hook cwd still resolves the repository-level .specs root", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-nested-cwd-"));
  mkdirSync(join(root, ".git"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), SPEC.replace("stable greeting", "friendly greeting"));
  writeFileSync(join(change, "plan.md"), plan());

  const result = evaluateHook("pre", event(change, join(change, "tasks.md"), "Edit"));
  assert.equal(result?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(result?.hookSpecificOutput?.permissionDecisionReason ?? "", /stale-spec-digest/u);
});

test("known shell writes are gated while unrelated and unknown shell commands bypass", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-shell-"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  const denied = evaluateHook("pre", { cwd: root, tool_name: "exec_command", tool_input: { cmd: "printf x > .specs/001-greeting/plan.md" } });
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.equal(evaluateHook("pre", { cwd: root, tool_name: "exec_command", tool_input: { cmd: "node build.mjs" } }), null);
  assert.equal(evaluateHook("pre", { cwd: root, tool_name: "exec_command", tool_input: { cmd: "node -e \"require('node:fs').writeFileSync('.specs/001-greeting/plan.md','x')\"" } }), null);
});

test("compound shell and same-call upstream/downstream writes are denied", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-toctou-"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), SPEC);
  writeFileSync(join(change, "plan.md"), plan());

  const compound = evaluateHook("pre", {
    cwd: root,
    tool_name: "exec_command",
    tool_input: { cmd: "printf changed > .specs/001-greeting/spec.md && printf old > .specs/001-greeting/tasks.md" },
  });
  assert.equal(compound?.hookSpecificOutput?.permissionDecision, "deny");

  const multiPatch = evaluateHook("pre", {
    cwd: root,
    tool_name: "apply_patch",
    tool_input: { patch: "*** Begin Patch\n*** Update File: .specs/001-greeting/spec.md\n+x\n*** Add File: .specs/001-greeting/tasks.md\n+y\n*** End Patch" },
  });
  assert.equal(multiPatch?.hookSpecificOutput?.permissionDecision, "deny");
});

test("post hook reports malformed artifact without blocking", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-post-"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), "# empty\n");
  const result = evaluateHook("post", event(root, join(change, "spec.md")));
  assert.match(result?.hookSpecificOutput?.additionalContext ?? "", /invalid/iu);
});

test("post hook stays silent for a valid upstream write even when downstream is stale", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-hook-post-stale-"));
  const change = join(root, ".specs", "001-greeting");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), SPEC);
  writeFileSync(join(change, "plan.md"), plan());
  writeFileSync(join(change, "tasks.md"), "# stale downstream\n");
  const changed = SPEC.replace("stable greeting", "friendly greeting");
  writeFileSync(join(change, "spec.md"), changed);
  assert.equal(evaluateHook("post", event(root, join(change, "spec.md"))), null);
  writeFileSync(join(change, "plan.md"), plan(changed));
  assert.equal(evaluateHook("post", event(root, join(change, "plan.md"))), null);
});

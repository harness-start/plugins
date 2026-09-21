import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { digestText } from "../../../src/domains/specification/lib/artifacts.js";

const source = readFileSync(new URL("../../../src/entries/cli/harness.ts", import.meta.url), "utf8");
const entry = new URL("../../../dist/cli/harness.mjs", import.meta.url);

const SPEC = `# Spec: Preserve task paths

## Intent
Preserve every declared task path.

## Requirements

### REQ-001: Preserve paths
Keep task file scopes intact.

#### Scenario: validate task paths
- Given a task with repository-relative paths
- When the task artifact is checked
- Then every path remains in its file scope

## Non-goals
- Changing task execution.
`;

function validPlan() {
  return `# Plan: Preserve task paths

Spec-Digest: sha256:${digestText(SPEC)}

## Approach
Validate REQ-001 through the public command.

## Change Surface
- src/index.ts

## Risks
- Dropped paths.

## Validation
- Run the public validator.
`;
}

function specificationFixture(taskBody: string) {
  const cwd = mkdtempSync(join(tmpdir(), "engineering-spec-cli-"));
  const change = join(cwd, ".specs", "001-preserve-paths");
  const plan = validPlan();
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "spec.md"), SPEC);
  writeFileSync(join(change, "plan.md"), plan);
  writeFileSync(join(change, "tasks.md"), `# Tasks: Preserve task paths

Spec-Digest: sha256:${digestText(SPEC)}
Plan-Digest: sha256:${digestText(plan)}

${taskBody}
`);
  return { cwd, change };
}

function runSpecCheck(taskBody: string) {
  const fixture = specificationFixture(taskBody);
  const result = spawnSync(process.execPath, [entry.pathname, "spec", "check", fixture.change], {
    cwd: fixture.cwd,
    encoding: "utf8",
  });
  return { result, output: JSON.parse(result.stdout) };
}

test("owner CLI registers its in-process commands", () => {
  assert.match(source, /runOwnerCli/u);
  assert.match(source, /debugging:\s*runDebugCommand/u);
  assert.match(source, /delegation:\s*runDelegationCommand/u);
  assert.match(source, /specification:\s*runSpecificationCommand/u);
});

test("bundled owner CLI executes exactly one debug route in a non-git directory", () => {
  const cwd = mkdtempSync(join(tmpdir(), "engineering-owner-cli-"));
  const result = spawnSync(process.execPath, [entry.pathname,
    "debug", "init",
    "--cwd", cwd,
    "--slug", "single-route",
    "--summary", "public CLI executes one route",
    "--user-outcome", "the public command returns one successful result",
    "--expected", "the command succeeds",
    "--actual", "multiple private commands execute",
    "--repro", "node --test test/repro.test.mjs",
    "--acceptance", "node --test test/acceptance.test.mjs",
    "--environment", "isolated non-git directory",
  ], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 1, result.stdout);
  assert.equal(JSON.parse(lines[0]).ok, true);
});

test("debug claim --help is side-effect free through the bundled owner CLI", () => {
  const cwd = mkdtempSync(join(tmpdir(), "engineering-owner-help-"));
  const opened = spawnSync(process.execPath, [entry.pathname,
    "debug", "init",
    "--cwd", cwd,
    "--slug", "help",
    "--summary", "help must not mutate",
    "--user-outcome", "help only prints usage",
    "--expected", "no event is appended",
    "--actual", "claim event is appended",
    "--repro", "node --test test/repro.test.mjs",
    "--acceptance", "node --test test/acceptance.test.mjs",
    "--environment", "isolated non-git directory",
  ], { cwd, encoding: "utf8" });
  assert.equal(opened.status, 0, opened.stderr);
  const events = join(cwd, ".debug-workflow", "help", "events.jsonl");
  const before = readFileSync(events, "utf8");

  const help = spawnSync(process.execPath, [entry.pathname, "debug", "claim", "--cwd", cwd, "--help"], {
    cwd,
    encoding: "utf8",
  });

  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stderr, "");
  assert.match(help.stdout, /Usage: harness debug claim/u);
  assert.equal(readFileSync(events, "utf8"), before);
});

test("bundled spec check preserves todo paths and verification commands", () => {
  const { result, output } = runSpecCheck(`## TASK-001: Preserve file paths
- Requirement: REQ-001
- Depends: none
- Files: docs/todo.md, runtimes/agent-sandbox/src/extensions/rpiv-todo.ts
- Verify: node tools/todo-check.mjs`);

  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.deepEqual(output.findings, []);
  assert.deepEqual(output.tasks.tasks[0].files, [
    "docs/todo.md",
    "runtimes/agent-sandbox/src/extensions/rpiv-todo.ts",
  ]);
});

test("bundled spec check preserves inline-code file scopes", () => {
  const { result, output } = runSpecCheck(`## TASK-001: Preserve one quoted path
- Requirement: REQ-001
- Depends: none
- Files: \`docs/guide.md\`
- Verify: pnpm test

## TASK-002: Preserve mixed paths
- Requirement: REQ-001
- Depends: TASK-001
- Files: src/index.ts, \`docs/reference.md\`
- Verify: pnpm test`);

  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.deepEqual(output.tasks.tasks.map((task) => task.files), [
    ["docs/guide.md"],
    ["src/index.ts", "docs/reference.md"],
  ]);
});

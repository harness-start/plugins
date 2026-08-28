import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { assertModuleRoutedOnBothHosts, readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("owner exposes equivalent platform-scoped routes for the private reporting module", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "reporting");
  const claudeEvents = Object.keys(readModuleRoutes(import.meta.url, "claude", "reporting")).sort();
  const codexEvents = Object.keys(readModuleRoutes(import.meta.url, "codex", "reporting")).sort();
  assert.deepEqual(codexEvents, claudeEvents);
  for (const event of ["PostToolUseFailure", "SessionStart", "UserPromptSubmit"]) {
    assert.equal(codexEvents.includes(event), true, event);
  }
});

test("plugin exposes one orchestrator, interview method, review skill, and no community deps", () => {
  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(skillNames, ["work-report-authoring", "work-report-interview", "work-report-review"]);
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  for (const skill of skillNames) {
    const content = readFileSync(join(ROOT, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(content, /--mode\b/u);
    assert.match(content, new RegExp(`^name:\\s*${skill}$`, "mu"));
  }
  const orchestrator = readFileSync(join(ROOT, "skills/work-report-authoring/SKILL.md"), "utf8");
  assert.match(orchestrator, /EvidenceBundleV2/u);
  assert.match(orchestrator, /WorkReportContractV2/u);
  assert.match(orchestrator, /prepared.*acknowledged.*saved/su);
  assert.match(orchestrator, /work-report-interview/u);
  assert.doesNotMatch(orchestrator, /\$(?:grilling|brag-sheet|growth-log|performance-review-writer)/u);
  const interview = readFileSync(join(ROOT, "skills/work-report-interview/SKILL.md"), "utf8");
  assert.match(interview, /one question|一次一问/iu);
});

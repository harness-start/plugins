import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const pluginFile = (relativePath: string) => new URL(`../${relativePath}`, import.meta.url);

test("owner routes the private research module with its bundled orchestrator Skill", async () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "research");
  assert.equal(existsSync(pluginFile("skills/research-evidence-workflow/SKILL.md")), true);
});

test("plugin is self-contained with no community skill-deps", async () => {
  assert.equal(existsSync(pluginFile("skill-deps.json")), false);
  const notice = await readFile(pluginFile("licenses/mattpocock/NOTICE.md"), "utf8");
  assert.match(notice, /mattpocock/iu);
  for (const relative of [
    "skills/research-evidence-workflow/references/primary-source-method.md",
    "skills/research-evidence-workflow/references/handoff-method.md",
  ]) {
    assert.equal(existsSync(pluginFile(relative)), true, relative);
  }
});

test("outbound handoff names artifacts and goals without routing to unbundled Skills", async () => {
  const template = await readFile(
    pluginFile("skills/research-evidence-workflow/references/outbound-handoff-template.md"),
    "utf8",
  );
  assert.doesNotMatch(template, /Suggested next skills|implementation-planning/iu);
  assert.match(template, /downstream goal/iu);
});

test("orchestrator keeps untrusted candidates outside the evidence boundary", async () => {
  const skill = await readFile(pluginFile("skills/research-evidence-workflow/SKILL.md"), "utf8");
  const composition = await readFile(
    pluginFile("skills/research-evidence-workflow/references/skill-composition.md"),
    "utf8",
  );
  const contract = `${skill}\n${composition}`;

  assert.doesNotMatch(contract, /skill-deps\.json/u);
  assert.match(contract, /candidate discovery only/iu);
  assert.match(contract, /source_capture.*source_anchor/isu);
  assert.match(contract, /primary-source-method\.md/u);
  assert.match(contract, /handoff-method\.md/u);
});

test("academic discovery degrades without installing packages or losing paper versions", async () => {
  const composition = await readFile(
    pluginFile("skills/research-evidence-workflow/references/skill-composition.md"),
    "utf8",
  );
  const discovery = await readFile(
    pluginFile("skills/research-evidence-workflow/references/discovery-via-mcp.md"),
    "utf8",
  );

  assert.match(composition, /do not loop or install packages/iu);
  assert.match(discovery, /\/abs\/<id>vN/iu);
  assert.match(discovery, /MCP `source_discover`/u);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pluginFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url);

test("skill dependency manifest follows the current arxiv-search source", async () => {
  const dependencies = JSON.parse(await readFile(pluginFile("skill-deps.json"), "utf8"));
  const arxiv = dependencies.skills.find(({ name }) => name === "arxiv-search");

  assert.ok(arxiv, "arxiv-search must be declared as a community skill dependency");
  assert.equal(
    arxiv.source,
    "https://github.com/langchain-ai/deepagents",
  );
  assert.equal(Object.hasOwn(arxiv, "revision"), false);
  assert.equal(Object.hasOwn(arxiv, "subpath"), false);
  assert.match(arxiv.description, /candidate discovery only/iu);
});

test("orchestrator keeps arxiv-search output outside the evidence boundary", async () => {
  const skill = await readFile(pluginFile("skills/research-evidence-workflow/SKILL.md"), "utf8");
  const composition = await readFile(
    pluginFile("skills/research-evidence-workflow/references/skill-composition.md"),
    "utf8",
  );
  const contract = `${skill}\n${composition}`;

  assert.match(contract, /arxiv-search/iu);
  assert.match(contract, /candidate discovery only/iu);
  assert.match(contract, /source_capture.*source_anchor/isu);
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

  assert.match(composition, /exits with no stdout/iu);
  assert.match(composition, /do not loop or install packages/iu);
  assert.match(discovery, /\/abs\/<id>vN/iu);
});

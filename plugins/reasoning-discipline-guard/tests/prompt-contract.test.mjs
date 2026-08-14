import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SKILL = fileURLToPath(
  new URL("../skills/reasoning-discipline/SKILL.md", import.meta.url),
);
const ARTIFACT_PROTOCOL = fileURLToPath(
  new URL(
    "../skills/reasoning-discipline/references/artifact-protocol.md",
    import.meta.url,
  ),
);

test("reasoning prompts localize natural-language values without translating machine tokens", () => {
  for (const path of [SKILL, ARTIFACT_PROTOCOL]) {
    const prompt = readFileSync(path, "utf8");

    assert.match(
      prompt,
      /agent-authored natural-language values?.*active (?:conversation|session) language/isu,
    );
    assert.match(prompt, /JSON.*YAML.*Markdown machine blocks/isu);
    assert.match(
      prompt,
      /schema.*keys.*enum literals.*IDs.*identifiers.*verbatim quotations.*unchanged/isu,
    );
    assert.match(
      prompt,
      /(?:template.*English placeholder|English placeholder.*template).*not the default output language/isu,
    );
  }
});

test("optional independent checks use plain generic delegation", () => {
  const skill = readFileSync(SKILL, "utf8");
  assert.match(skill, /fresh generic read-only subagent/iu);
  assert.match(skill, /reply as advice/iu);
  assert.doesNotMatch(skill, /RD_REVIEW_REQUEST|reviewNonce|subagent-handoff|subagent-plan-execution/u);
});

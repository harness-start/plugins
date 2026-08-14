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

test("artifact protocol provides branch-specific frame templates", () => {
  const protocol = readFileSync(ARTIFACT_PROTOCOL, "utf8");
  assert.match(protocol, /^## 01-frame\.md: exact$/mu);
  assert.match(protocol, /^## 01-frame\.md: causal and decision$/mu);
  const nonExactFrame = protocol.split("## 01-frame.md: causal and decision")[1]?.split("## 02-analysis.md: exact")[0] ?? "";
  assert.match(nonExactFrame, /"branch": "causal"/u);
  assert.doesNotMatch(nonExactFrame, /controlAssignments|observabilityAudit/u);
});

test("review dispatch contract isolates context and bounds waiting", () => {
  const skill = readFileSync(SKILL, "utf8");
  assert.match(skill, /Codex.*fork_turns.*none/isu);
  assert.match(skill, /wait once.*(?:60|90) seconds/isu);
  assert.match(skill, /reviewer.*timeout.*pause.*partial facts/isu);
  assert.match(skill, /do not use.*subagent-handoff.*native reviewer/isu);
});

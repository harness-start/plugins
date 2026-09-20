import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  InvocationPolicy,
  defineAntiPattern,
  defineSkill,
  defineSkillGoal,
  defineSkillOutputs,
  defineWorkflow,
  defineWorkflowStep,
  skillRef,
} from "../../skill/define.ts";
import { emitPluginSkills, emitSkill } from "../../skill/emit.ts";
import {
  compactCodexShortDescription,
  renderCodexOpenAiYaml,
  renderSkillMd,
} from "../../skill/render.ts";

const sampleMethod = defineSkill({
  id: "sample-method",
  fullName: "Sample Method",
  description: "Use when testing the skill emitter. Do not hand-edit generated markdown.",
  useCases: ["Generate SKILL.md from TypeScript."],
  constraints: ["Do not write plugins/*/skills directly."],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: {
    version: "1.2.3",
    license: "MIT",
    allowedTools: ["Read"],
    argumentHint: "[input]",
    metadata: { category: "testing" },
  },
  goal: defineSkillGoal({
    title: "Method",
    body: "Keep the method in source TypeScript.",
  }),
  workflow: defineWorkflow({
    steps: [
      defineWorkflowStep({ id: "step-1", label: "Edit the TypeScript source." }),
      defineWorkflowStep({ id: "step-2", label: "Run npm run build." }),
    ],
  }),
  outputs: defineSkillOutputs({ items: ["Generated SKILL.md"] }),
  checklist: ["Is the generated file committed?"],
  antiPatterns: [defineAntiPattern({ fail: "Edit SKILL.md", pass: "Edit index.ts" })],
  relatedSkills: [skillRef("sample-config", { reason: "Config stays explicit-only." })],
});

const sampleConfig = defineSkill({
  id: "sample-config",
  fullName: "Sample Config",
  description: "Change sample thresholds in .sample.mjs.",
  useCases: ["Update project sample configuration."],
  constraints: ["Do not invent extra config callbacks."],
  invocation: InvocationPolicy.ExplicitOnly,
  goal: defineSkillGoal({
    body: "Edit `.sample.mjs` at the Git root.",
  }),
});

const expectedSampleMethodMarkdown = `---
name: sample-method
description: "Use when testing the skill emitter. Do not hand-edit generated markdown."
version: "1.2.3"
license: "MIT"
allowed-tools:
  - "Read"
argument-hint: "[input]"
metadata:
  category: "testing"
---

# Sample Method

## When to use

- Generate SKILL.md from TypeScript.

## Constraints

- Do not write plugins/*/skills directly.

## Method

Keep the method in source TypeScript.

## Workflow

1. Edit the TypeScript source.
2. Run npm run build.

## Outputs

- Generated SKILL.md

## Checklist

- [ ] Is the generated file committed?

## Anti-patterns

| Anti-pattern | Instead |
| --- | --- |
| Edit SKILL.md | Edit index.ts |

## Related skills

- [sample-config](../sample-config/SKILL.md) — Config stays explicit-only.
`;

test("renders a structured SKILL.md with a stable section order", () => {
  assert.equal(renderSkillMd(sampleMethod), expectedSampleMethodMarkdown);
});

test("explicit-only config skills set Claude and Codex invocation gates", () => {
  const markdown = renderSkillMd(sampleConfig);
  assert.match(markdown, /^---\nname: sample-config\n/u);
  assert.match(markdown, /^disable-model-invocation: true$/mu);
  assert.equal(
    renderCodexOpenAiYaml(sampleConfig),
    [
      "interface:",
      '  display_name: "Sample Config"',
      '  short_description: "Change sample thresholds in .sample.mjs."',
      '  default_prompt: "Use $sample-config to: Change sample thresholds in .sample.mjs."',
      "policy:",
      "  allow_implicit_invocation: false",
      "",
    ].join("\n"),
  );
});

test("wraps multiline list items without creating unintended top-level sections", () => {
  const markdown = renderSkillMd(defineSkill({
    id: "multiline-sample",
    fullName: "Multiline Sample",
    description: "Exercise multiline list rendering in generated Skill markdown.",
    useCases: ["First line.\n\n- nested detail"],
    constraints: ["Keep the whole item together.\n\n## Not a section"],
    invocation: InvocationPolicy.ImplicitAndExplicit,
  }));

  assert.match(markdown, /- First line\.\n\n {2}- nested detail/u);
  assert.match(markdown, /- Keep the whole item together\.\n\n {2}## Not a section/u);
});

test("does not end compact Codex descriptions on connector words", () => {
  const compact = compactCodexShortDescription(
    "Initialize or diagnose .agent-activity-audit.mjs for the agent-activity-audit trail plugin.",
  );
  assert.equal(compact, "Initialize or diagnose .agent-activity-audit.mjs");
});

test("emits SKILL.md, Codex yaml, and copies references, assets, and scripts", () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "skill-source-"));
  const outputRoot = mkdtempSync(join(tmpdir(), "skill-output-"));
  try {
    mkdirSync(join(sourceRoot, "references"), { recursive: true });
    mkdirSync(join(sourceRoot, "assets"), { recursive: true });
    mkdirSync(join(sourceRoot, "scripts"), { recursive: true });
    mkdirSync(join(sourceRoot, "evals"), { recursive: true });
    writeFileSync(join(sourceRoot, "references", "notes.md"), "reference body\n");
    writeFileSync(join(sourceRoot, "assets", "profile.json"), "{\"ok\":true}\n");
    writeFileSync(join(sourceRoot, "scripts", "probe.sh"), "#!/bin/sh\n");
    writeFileSync(join(sourceRoot, "evals", "cases.yaml"), "cases: []\n");
    writeFileSync(join(sourceRoot, ".workwise-skill-source.json"), "{\"source\":\"example\"}\n");
    chmodSync(join(sourceRoot, "scripts", "probe.sh"), 0o755);

    const files = emitSkill(
      { ...sampleMethod, sourceDir: pathToFileURL(`${sourceRoot}/`) },
      outputRoot,
      new Set(["sample-method", "sample-config"]),
    );
    const relative = files.map((file) => file.path).toSorted();
    assert.deepEqual(relative, [
      ".workwise-skill-source.json",
      "SKILL.md",
      "agents/openai.yaml",
      "assets/profile.json",
      "evals/cases.yaml",
      "references/notes.md",
      "scripts/probe.sh",
    ]);
    assert.equal(
      readFileSync(join(outputRoot, "SKILL.md"), "utf8"),
      expectedSampleMethodMarkdown.replace(
        "## Related skills\n",
        "## References\n\n- [notes.md](references/notes.md)\n\n## Related skills\n",
      ),
    );
    assert.match(readFileSync(join(outputRoot, "agents/openai.yaml"), "utf8"), /display_name: "Sample Method"/u);
    assert.equal(readFileSync(join(outputRoot, "references/notes.md"), "utf8"), "reference body\n");
    assert.equal(readFileSync(join(outputRoot, "assets/profile.json"), "utf8"), "{\"ok\":true}\n");
    assert.equal(readFileSync(join(outputRoot, "scripts/probe.sh"), "utf8"), "#!/bin/sh\n");
    assert.equal(readFileSync(join(outputRoot, "evals/cases.yaml"), "utf8"), "cases: []\n");
    assert.equal(
      readFileSync(join(outputRoot, ".workwise-skill-source.json"), "utf8"),
      "{\"source\":\"example\"}\n",
    );
    assert.equal(statSync(join(outputRoot, "scripts/probe.sh")).mode & 0o777, 0o755);
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("plugin skill check fails when committed SKILL.md does not match the TypeScript source", async () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), "plugin-skills-"));
  try {
    const sourceDir = join(pluginRoot, "src/skills/sample-method");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "index.ts"), `import { InvocationPolicy, defineSkill } from ${JSON.stringify(new URL("../../skill/define.ts", import.meta.url).href)};
export default defineSkill({
  id: "sample-method",
  fullName: "Sample Method",
  description: "Use when testing the skill emitter. Do not hand-edit generated markdown.",
  useCases: ["Generate SKILL.md from TypeScript."],
  constraints: ["Do not write plugins/*/skills directly."],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  sourceDir: new URL("./", import.meta.url),
});
`);
    mkdirSync(join(pluginRoot, "skills/sample-method"), { recursive: true });
    writeFileSync(join(pluginRoot, "skills/sample-method/SKILL.md"), "# stale\n");

    await assert.rejects(
      () => emitPluginSkills(pluginRoot, { check: true }),
      /changed .*skills\/sample-method\/SKILL.md/u,
    );
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("plugin skill check fails when a generated script loses its executable mode", async () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), "plugin-skills-"));
  try {
    const sourceDir = join(pluginRoot, "src/skills/sample-method");
    mkdirSync(join(sourceDir, "scripts"), { recursive: true });
    writeFileSync(join(sourceDir, "index.ts"), `import { InvocationPolicy, defineSkill } from ${JSON.stringify(new URL("../../skill/define.ts", import.meta.url).href)};
export default defineSkill({
  id: "sample-method",
  fullName: "Sample Method",
  description: "Use when testing generated file modes.",
  useCases: ["Generate an executable helper."],
  constraints: ["Preserve its executable mode."],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  sourceDir: new URL("./", import.meta.url),
});
`);
    const sourceScript = join(sourceDir, "scripts/probe.sh");
    writeFileSync(sourceScript, "#!/bin/sh\n");
    chmodSync(sourceScript, 0o755);

    await emitPluginSkills(pluginRoot);
    chmodSync(join(pluginRoot, "skills/sample-method/scripts/probe.sh"), 0o644);

    await assert.rejects(
      () => emitPluginSkills(pluginRoot, { check: true }),
      /mode .*skills\/sample-method\/scripts\/probe\.sh/u,
    );
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("plugin skill check fails when a generated tree has no TypeScript source", async () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), "plugin-skills-"));
  try {
    mkdirSync(join(pluginRoot, "skills/stale-skill"), { recursive: true });
    writeFileSync(join(pluginRoot, "skills/stale-skill/SKILL.md"), "# stale\n");

    await assert.rejects(
      () => emitPluginSkills(pluginRoot, { check: true }),
      /extra .*skills\/stale-skill\/SKILL.md/u,
    );
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

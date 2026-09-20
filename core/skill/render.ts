import {
  InvocationPolicy,
  type ComponentText,
  type SkillDefinition,
  renderComponentText,
} from "./define.ts";

const SHORT_DESCRIPTION_MIN_LENGTH = 25;
const SHORT_DESCRIPTION_MAX_LENGTH = 64;
const BOUNDARY_PRIORITY = ["。；;", "，,、：:）)", " "] as const;
const TRAILING_BOUNDARY_RE = /[，,、；;：:\s]+$/u;
const TRAILING_CONNECTOR_RE = /\b(?:a|an|and|for|from|of|or|the|to|via|when|with)$/iu;

export function compactCodexShortDescription(description: string): string {
  const normalized = description.replace(/\s+/gu, " ").trim();
  if (normalized.length <= SHORT_DESCRIPTION_MAX_LENGTH) return normalized;

  const maxEnd = Math.min(normalized.length, SHORT_DESCRIPTION_MAX_LENGTH);
  for (const boundaryChars of BOUNDARY_PRIORITY) {
    let boundaryEnd = -1;
    for (let i = SHORT_DESCRIPTION_MIN_LENGTH - 1; i < maxEnd; i += 1) {
      if (!boundaryChars.includes(normalized[i] ?? "")) continue;
      const candidate = normalized.slice(0, i + 1).replace(TRAILING_BOUNDARY_RE, "").trim();
      if (!TRAILING_CONNECTOR_RE.test(candidate)) boundaryEnd = i + 1;
    }
    if (boundaryEnd >= SHORT_DESCRIPTION_MIN_LENGTH) {
      const candidate = normalized.slice(0, boundaryEnd).replace(TRAILING_BOUNDARY_RE, "").trim();
      if (candidate.length >= SHORT_DESCRIPTION_MIN_LENGTH) return candidate;
    }
  }

  return `${normalized.slice(0, SHORT_DESCRIPTION_MAX_LENGTH - 3).trimEnd()}...`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function indentListContinuation(line: string): string {
  return line === "" ? "" : `  ${line}`;
}

function bulletList(items: readonly ComponentText[]): string {
  return items.map((item) => {
    const [first, ...rest] = renderComponentText(item).trim().split(/\r?\n/u);
    return [`- ${first ?? ""}`, ...rest.map(indentListContinuation)].join("\n");
  }).join("\n");
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function normalizeMarkdown(markdown: string): string {
  return `${markdown.replace(/\r\n/g, "\n").replace(/\n{3,}/gu, "\n\n").trimEnd()}\n`;
}

function renderFrontmatter(skill: SkillDefinition): string {
  const lines = [
    "---",
    `name: ${skill.id}`,
    `description: ${yamlString(renderComponentText(skill.description))}`,
  ];
  if (skill.invocation === InvocationPolicy.ExplicitOnly) {
    lines.push("disable-model-invocation: true");
  }
  const frontmatter = skill.frontmatter;
  if (frontmatter?.version) lines.push(`version: ${yamlString(frontmatter.version)}`);
  if (frontmatter?.license) lines.push(`license: ${yamlString(frontmatter.license)}`);
  if (frontmatter?.allowedTools?.length) {
    lines.push("allowed-tools:", ...frontmatter.allowedTools.map((tool) => `  - ${yamlString(tool)}`));
  }
  if (frontmatter?.argumentHint) {
    lines.push(`argument-hint: ${yamlString(frontmatter.argumentHint)}`);
  }
  const metadata = Object.entries(frontmatter?.metadata ?? {});
  if (metadata.length > 0) {
    lines.push("metadata:", ...metadata.map(([key, value]) => `  ${key}: ${yamlString(value)}`));
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function stripMatchingHeading(body: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return body.replace(new RegExp(`^#\\s+${escaped}\\s*(?:\\r?\\n)+`, "u"), "");
}

function renderGoal(skill: SkillDefinition): string {
  const goal = skill.goal;
  if (!goal) return "";
  const body = stripMatchingHeading(renderComponentText(goal.body).trim(), skill.fullName).trim();
  if (!body) return "";
  if (goal.title?.trim()) return `## ${goal.title.trim()}\n\n${body}\n`;
  return `${body}\n`;
}

function renderWorkflow(skill: SkillDefinition): string {
  const steps = skill.workflow?.steps ?? [];
  if (steps.length === 0) return "";
  const lines = steps.map((step, index) => `${index + 1}. ${renderComponentText(step.label)}`);
  return `## Workflow\n\n${lines.join("\n")}\n`;
}

function renderOutputs(skill: SkillDefinition): string {
  const outputs = skill.outputs;
  if (!outputs) return "";
  const title = outputs.title?.trim() || "Outputs";
  if (outputs.items && outputs.items.length > 0) {
    return `## ${title}\n\n${bulletList(outputs.items)}\n`;
  }
  const body = outputs.body ? renderComponentText(outputs.body).trim() : "";
  if (!body) return "";
  return `## ${title}\n\n${body}\n`;
}

function renderChecklist(skill: SkillDefinition): string {
  const checklist = skill.checklist ?? [];
  if (checklist.length === 0) return "";
  const lines = checklist.map((item) => {
    const [first, ...rest] = renderComponentText(item).trim().split(/\r?\n/u);
    return [`- [ ] ${first ?? ""}`, ...rest.map(indentListContinuation)].join("\n");
  });
  return `## Checklist\n\n${lines.join("\n")}\n`;
}

function renderAntiPatterns(skill: SkillDefinition): string {
  const antiPatterns = skill.antiPatterns ?? [];
  if (antiPatterns.length === 0) return "";
  const rows = [
    "| Anti-pattern | Instead |",
    "| --- | --- |",
    ...antiPatterns.map((item) =>
      `| ${tableCell(renderComponentText(item.fail))} | ${tableCell(renderComponentText(item.pass))} |`
    ),
  ];
  return `## Anti-patterns\n\n${rows.join("\n")}\n`;
}

function renderParameters(skill: SkillDefinition): string {
  const parameters = skill.parameters ?? [];
  if (parameters.length === 0) return "";
  const rows = [
    "| Parameter | Type | Required | Description |",
    "| --- | --- | --- | --- |",
    ...parameters.map((parameter) => {
      const cells = [
        `\`${parameter.name}\``,
        parameter.type ?? "string",
        parameter.required === false ? "no" : "yes",
        renderComponentText(parameter.description),
      ];
      return `| ${cells.map(tableCell).join(" | ")} |`;
    }),
  ];
  return `## User input\n\n${rows.join("\n")}\n`;
}

function renderReferences(referenceFiles: readonly string[]): string {
  if (referenceFiles.length === 0) return "";
  const items = referenceFiles.map((file) => `- [${file}](references/${file})`);
  return `## References\n\n${items.join("\n")}\n`;
}

function renderRelatedSkills(skill: SkillDefinition): string {
  const related = skill.relatedSkills ?? [];
  if (related.length === 0) return "";
  const items = related.map((item) => {
    const label = item.label ?? item.id;
    const reason = item.reason ? ` — ${renderComponentText(item.reason)}` : "";
    return `- [${label}](../${item.id}/SKILL.md)${reason}`;
  });
  return `## Related skills\n\n${items.join("\n")}\n`;
}

export function renderSkillMd(
  skill: SkillDefinition,
  options: { referenceFiles?: readonly string[] } = {},
): string {
  if (typeof skill.fullName !== "string" || skill.fullName.trim() === "") {
    throw new Error(`Skill ${skill.id} must define a non-empty fullName`);
  }
  if (skill.useCases.length === 0) throw new Error(`Skill ${skill.id} must define at least one useCase`);
  if (skill.constraints.length === 0) throw new Error(`Skill ${skill.id} must define at least one constraint`);

  const sections = [
    renderFrontmatter(skill),
    `# ${skill.fullName}\n`,
    `## When to use\n\n${bulletList(skill.useCases)}\n`,
    `## Constraints\n\n${bulletList(skill.constraints)}\n`,
    renderParameters(skill),
    renderGoal(skill),
    renderWorkflow(skill),
    renderOutputs(skill),
    renderChecklist(skill),
    renderAntiPatterns(skill),
    renderReferences(options.referenceFiles ?? []),
    renderRelatedSkills(skill),
  ].filter((section) => section.trim() !== "")
    .map((section) => section.trimEnd());
  return normalizeMarkdown(sections.join("\n\n"));
}

export function renderCodexOpenAiYaml(skill: SkillDefinition): string {
  const description = renderComponentText(skill.description);
  const shortDescription = skill.codexInterface?.shortDescription
    ?? compactCodexShortDescription(description);
  const defaultPrompt = skill.codexInterface?.defaultPrompt
    ?? `Use $${skill.id} to: ${compactCodexShortDescription(description)}`;
  const lines = [
    "interface:",
    `  display_name: ${yamlString(skill.fullName)}`,
    `  short_description: ${yamlString(shortDescription)}`,
    `  default_prompt: ${yamlString(defaultPrompt)}`,
  ];
  if (skill.invocation === InvocationPolicy.ExplicitOnly) {
    lines.push("policy:", "  allow_implicit_invocation: false");
  }
  return `${lines.join("\n")}\n`;
}

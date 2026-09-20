export enum InvocationPolicy {
  ImplicitAndExplicit = "implicit-and-explicit",
  ExplicitOnly = "explicit-only",
}

export type ComponentTextDefinition = {
  kind: "component-text";
  strings: readonly string[];
  values: readonly ComponentTextInterpolation[];
};

export type SkillRef = {
  kind: "skill";
  id: string;
  label?: string;
  reason?: string;
};

export type ComponentTextInterpolation = string | SkillRef;
export type ComponentText = string | ComponentTextDefinition;

export type AntiPatternDefinition = {
  fail: ComponentText;
  pass: ComponentText;
};

export type SkillGoalDefinition = {
  title?: string;
  body: ComponentText;
};

export type WorkflowStepDefinition = {
  id: string;
  label: ComponentText;
};

export type WorkflowDefinition = {
  steps?: readonly WorkflowStepDefinition[];
};

export type SkillOutputsDefinition = {
  title?: string;
  items?: readonly ComponentText[];
  body?: ComponentText;
};

export type SkillParameter = {
  name: string;
  description: ComponentText;
  required?: boolean;
  type?: string;
};

export type CodexInterface = {
  shortDescription?: string;
  defaultPrompt?: string;
};

export type SkillFrontmatter = {
  version?: string;
  license?: string;
  allowedTools?: readonly string[];
  argumentHint?: string;
  metadata?: Readonly<Record<string, string>>;
};

export type SkillDefinition = {
  kind: "skill";
  id: string;
  fullName: string;
  description: ComponentText;
  useCases: readonly ComponentText[];
  constraints: readonly ComponentText[];
  checklist?: readonly ComponentText[];
  antiPatterns?: readonly AntiPatternDefinition[];
  invocation: InvocationPolicy;
  goal?: SkillGoalDefinition;
  workflow?: WorkflowDefinition;
  outputs?: SkillOutputsDefinition;
  relatedSkills?: readonly SkillRef[];
  parameters?: readonly SkillParameter[];
  sourceDir?: URL;
  codexInterface?: CodexInterface;
  frontmatter?: SkillFrontmatter;
};

export function defineSkill(definition: Omit<SkillDefinition, "kind">): SkillDefinition {
  return { kind: "skill", ...definition };
}

export function defineSkillGoal(definition: SkillGoalDefinition): SkillGoalDefinition {
  return definition;
}

export function defineWorkflow(definition: WorkflowDefinition): WorkflowDefinition {
  return definition;
}

export function defineWorkflowStep(definition: WorkflowStepDefinition): WorkflowStepDefinition {
  return definition;
}

export function defineSkillOutputs(definition: SkillOutputsDefinition): SkillOutputsDefinition {
  return definition;
}

export function defineAntiPattern(definition: AntiPatternDefinition): AntiPatternDefinition {
  return definition;
}

export function skillRef(id: string, options: { reason?: string; label?: string } = {}): SkillRef {
  return { kind: "skill", id, ...options };
}

export function componentText(
  strings: TemplateStringsArray,
  ...values: ComponentTextInterpolation[]
): ComponentTextDefinition {
  return { kind: "component-text", strings: [...strings], values: [...values] };
}

export function renderComponentText(text: ComponentText): string {
  if (typeof text === "string") return text;
  let result = "";
  for (const [index, chunk] of text.strings.entries()) {
    result += chunk;
    const value = text.values[index];
    if (value === undefined) continue;
    if (typeof value === "string") result += value;
    else result += `[${value.label ?? value.id}](../${value.id}/SKILL.md)`;
  }
  return result;
}

export function isSkillDefinition(value: unknown): value is SkillDefinition {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SkillDefinition>;
  return record.kind === "skill" && typeof record.id === "string" && record.id.length > 0;
}

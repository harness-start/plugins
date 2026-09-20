import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  InvocationPolicy,
  isSkillDefinition,
  type SkillDefinition,
} from "./define.ts";
import { renderCodexOpenAiYaml, renderSkillMd } from "./render.ts";

export type EmittedSkillFile = {
  path: string;
  contents: Buffer;
  mode: number;
};

const COPIED_DIRECTORIES = ["references", "assets", "scripts", "evals"] as const;
const COPIED_FILES = ["README.md", "LICENSE.txt", "LICENSE", ".workwise-skill-source.json"] as const;

function posix(path: string): string {
  return path.split(sep).join("/");
}

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function assertInside(path: string, parent: string): void {
  const rel = relative(parent, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`unsafe generated path: ${path}`);
  }
}

function sourceRoot(skill: SkillDefinition): string | undefined {
  if (!skill.sourceDir) return undefined;
  return fileURLToPath(skill.sourceDir);
}

function generatedMode(fileMode: number): number {
  return (fileMode & 0o111) === 0 ? 0o644 : 0o755;
}

function copiedFiles(skill: SkillDefinition): EmittedSkillFile[] {
  const root = sourceRoot(skill);
  if (!root) return [];
  const files: EmittedSkillFile[] = [];
  for (const directory of COPIED_DIRECTORIES) {
    const directoryRoot = join(root, directory);
    for (const path of filesUnder(directoryRoot)) {
      files.push({
        path: posix(join(directory, relative(directoryRoot, path))),
        contents: readFileSync(path),
        mode: generatedMode(statSync(path).mode),
      });
    }
  }
  for (const name of COPIED_FILES) {
    const path = join(root, name);
    if (existsSync(path)) {
      files.push({ path: name, contents: readFileSync(path), mode: generatedMode(statSync(path).mode) });
    }
  }
  return files;
}

function referenceFiles(skill: SkillDefinition): string[] {
  const root = sourceRoot(skill);
  if (!root) return [];
  return filesUnder(join(root, "references"))
    .map((path) => posix(relative(join(root, "references"), path)))
    .toSorted();
}

function validateSkill(skill: SkillDefinition, siblingIds: ReadonlySet<string>): void {
  if (skill.id.endsWith("-config") && skill.invocation !== InvocationPolicy.ExplicitOnly) {
    throw new Error(`Skill ${skill.id} must be explicit-only`);
  }
  for (const related of skill.relatedSkills ?? []) {
    if (!siblingIds.has(related.id)) {
      throw new Error(`Skill ${skill.id} relatedSkills target is not in the same owner: ${related.id}`);
    }
  }
}

export function plannedSkillFiles(
  skill: SkillDefinition,
  siblingIds: ReadonlySet<string>,
): EmittedSkillFile[] {
  validateSkill(skill, siblingIds);
  const files = [
    {
      path: "SKILL.md",
      contents: Buffer.from(renderSkillMd(skill, { referenceFiles: referenceFiles(skill) })),
      mode: 0o644,
    },
    {
      path: "agents/openai.yaml",
      contents: Buffer.from(renderCodexOpenAiYaml(skill)),
      mode: 0o644,
    },
    ...copiedFiles(skill),
  ];
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) throw new Error(`Skill ${skill.id} emits duplicate path ${file.path}`);
    seen.add(file.path);
  }
  return files.toSorted((left, right) => left.path.localeCompare(right.path));
}

export function emitSkill(
  skill: SkillDefinition,
  outputRoot: string,
  siblingIds: ReadonlySet<string>,
): EmittedSkillFile[] {
  const files = plannedSkillFiles(skill, siblingIds);
  rmSync(outputRoot, { recursive: true, force: true });
  for (const file of files) {
    const path = join(outputRoot, file.path);
    assertInside(path, outputRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.contents);
    chmodSync(path, file.mode);
  }
  return files;
}

export type EmitPluginSkillsOptions = {
  check?: boolean;
  ensure?: boolean;
};

export type EmitPluginSkillsResult = {
  action: "skipped" | "checked" | "current" | "rebuilt" | "built";
  count: number;
  differences: string[];
};

function skillDirectories(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

async function loadSkill(indexPath: string, id: string): Promise<SkillDefinition> {
  const module = await import(pathToFileURL(indexPath).href) as Record<string, unknown>;
  const candidates = [module.default, ...Object.values(module)].filter(isSkillDefinition);
  const unique = [...new Map(candidates.map((skill) => [skill.id, skill])).values()];
  if (unique.length !== 1) {
    throw new Error(`${indexPath} must export exactly one Skill definition`);
  }
  const skill = unique[0];
  if (!skill || skill.id !== id) {
    throw new Error(`${indexPath} must export Skill id ${id}`);
  }
  return {
    ...skill,
    sourceDir: skill.sourceDir ?? pathToFileURL(`${dirname(indexPath)}/`),
  };
}

export async function loadPluginSkills(pluginRoot: string): Promise<SkillDefinition[]> {
  const sourceRoot = join(pluginRoot, "src", "skills");
  if (!existsSync(sourceRoot)) return [];
  const skills: SkillDefinition[] = [];
  for (const id of skillDirectories(sourceRoot)) {
    const indexPath = join(sourceRoot, id, "index.ts");
    if (!existsSync(indexPath)) {
      throw new Error(`Skill source ${relative(pluginRoot, join(sourceRoot, id))} is missing index.ts`);
    }
    skills.push(await loadSkill(indexPath, id));
  }
  return skills;
}

function expectedSkillTree(skills: readonly SkillDefinition[]): Map<string, EmittedSkillFile> {
  const siblingIds = new Set(skills.map((skill) => skill.id));
  const expected = new Map<string, EmittedSkillFile>();
  for (const skill of skills) {
    for (const file of plannedSkillFiles(skill, siblingIds)) {
      const path = posix(join("skills", skill.id, file.path));
      expected.set(path, { ...file, path });
    }
  }
  return expected;
}

function actualSkillTree(pluginRoot: string): Map<string, EmittedSkillFile> {
  const skillsRoot = join(pluginRoot, "skills");
  const actual = new Map<string, EmittedSkillFile>();
  for (const path of filesUnder(skillsRoot)) {
    const relativePath = posix(relative(pluginRoot, path));
    actual.set(relativePath, {
      path: relativePath,
      contents: readFileSync(path),
      mode: generatedMode(statSync(path).mode),
    });
  }
  return actual;
}

function treeDifferences(
  pluginRoot: string,
  expected: Map<string, EmittedSkillFile>,
  actual: Map<string, EmittedSkillFile>,
): string[] {
  const prefix = posix(relative(process.cwd(), pluginRoot) || ".");
  const differences: string[] = [];
  for (const [path, file] of expected) {
    const current = actual.get(path);
    if (!current) differences.push(`missing ${prefix}/${path}`);
    else if (!current.contents.equals(file.contents)) differences.push(`changed ${prefix}/${path}`);
    else if (current.mode !== file.mode) differences.push(`mode ${prefix}/${path}`);
  }
  for (const path of actual.keys()) {
    if (!expected.has(path)) differences.push(`extra ${prefix}/${path}`);
  }
  return differences;
}

function writeSkillTree(pluginRoot: string, expected: Map<string, EmittedSkillFile>): void {
  const skillsRoot = join(pluginRoot, "skills");
  if (expected.size === 0) {
    rmSync(skillsRoot, { recursive: true, force: true });
    return;
  }
  const tempRoot = `${skillsRoot}.tmp-build`;
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });
  try {
    for (const [path, file] of expected) {
      const outputPath = join(tempRoot, path.slice("skills/".length));
      assertInside(outputPath, tempRoot);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, file.contents);
      chmodSync(outputPath, file.mode);
    }
    rmSync(skillsRoot, { recursive: true, force: true });
    renameSync(tempRoot, skillsRoot);
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function emitPluginSkills(
  pluginRoot: string,
  options: EmitPluginSkillsOptions = {},
): Promise<EmitPluginSkillsResult> {
  if (options.check && options.ensure) throw new Error("--check and --ensure are mutually exclusive");
  const skills = await loadPluginSkills(pluginRoot);
  if (skills.length === 0) {
    if (existsSync(join(pluginRoot, "src", "skills"))) {
      throw new Error(`${pluginRoot} has src/skills but no Skill definitions`);
    }
    if (!existsSync(join(pluginRoot, "skills"))) {
      return { action: "skipped", count: 0, differences: [] };
    }
  }

  const expected = expectedSkillTree(skills);
  const actual = actualSkillTree(pluginRoot);
  const differences = treeDifferences(pluginRoot, expected, actual);
  if (options.check) {
    if (differences.length > 0) throw new Error(differences.join("\n"));
    return { action: "checked", count: expected.size, differences };
  }
  if (options.ensure) {
    if (differences.length === 0) return { action: "current", count: expected.size, differences };
    writeSkillTree(pluginRoot, expected);
    return { action: "rebuilt", count: expected.size, differences };
  }
  writeSkillTree(pluginRoot, expected);
  return { action: "built", count: expected.size, differences };
}

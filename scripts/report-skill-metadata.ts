import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pluginsRoot = resolve(repositoryRoot, "plugins");

export type SkillMetadata = {
  name: string;
  description: string;
  descriptionCharacters: number;
  implicit: boolean;
  approxTokens: number;
  path: string;
};

export type PluginSkillMetadata = {
  name: string;
  totalSkills: number;
  implicitSkills: number;
  explicitOnlySkills: number;
  approxImplicitTokens: number;
  bundledFiles: number;
  bundledBytes: number;
  rasterImages: number;
  skills: SkillMetadata[];
};

export type SkillMetadataReport = {
  schema: "harness-start/skill-metadata-report/v1";
  plugins: PluginSkillMetadata[];
  totals: {
    totalSkills: number;
    implicitSkills: number;
    explicitOnlySkills: number;
    approxImplicitTokens: number;
  };
};

type SkillFrontmatter = {
  name?: unknown;
  description?: unknown;
};

type OpenAiMetadata = {
  policy?: {
    allow_implicit_invocation?: unknown;
  };
};

function normalizedDescription(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function frontmatter(text: string, path: string): SkillFrontmatter {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match?.[1]) throw new Error(`Skill 缺少 YAML frontmatter：${path}`);
  const parsed = parse(match[1]) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Skill frontmatter 不是对象：${path}`);
  }
  return parsed as SkillFrontmatter;
}

async function skillDirectories(skillsRoot: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(directory, entry.name);
      if (existsSync(resolve(path, "SKILL.md"))) found.push(path);
      await visit(path);
    }
  };
  await visit(skillsRoot);
  return found.toSorted();
}

async function bundledInventory(skillsRoot: string): Promise<{
  bundledFiles: number;
  bundledBytes: number;
  rasterImages: number;
}> {
  let bundledFiles = 0;
  let bundledBytes = 0;
  let rasterImages = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      bundledFiles += 1;
      bundledBytes += (await stat(path)).size;
      if (/\.(?:gif|jpe?g|png|webp)$/iu.test(entry.name)) rasterImages += 1;
    }
  };
  await visit(skillsRoot);
  return { bundledFiles, bundledBytes, rasterImages };
}

async function implicitPolicy(skillRoot: string): Promise<boolean> {
  const path = resolve(skillRoot, "agents", "openai.yaml");
  if (!existsSync(path)) return true;
  const parsed = parse(await readFile(path, "utf8")) as OpenAiMetadata | null;
  return parsed?.policy?.allow_implicit_invocation !== false;
}

function approxCatalogTokens(name: string, description: string, path: string): number {
  const rendered = `- ${name}: ${description} (${path})`;
  return Math.ceil(Buffer.byteLength(rendered, "utf8") / 4);
}

async function inspectPlugin(pluginName: string): Promise<PluginSkillMetadata> {
  const pluginRoot = resolve(pluginsRoot, pluginName);
  const relativeRoot = relative(pluginsRoot, pluginRoot);
  if (!relativeRoot || relativeRoot === ".." || relativeRoot.startsWith(`..${sep}`)) {
    throw new Error(`插件名超出 plugins/：${pluginName}`);
  }
  const skillsRoot = resolve(pluginRoot, "skills");
  if (!existsSync(skillsRoot)) throw new Error(`插件没有 skills/：${pluginName}`);
  const inventory = await bundledInventory(skillsRoot);

  const skills = await Promise.all((await skillDirectories(skillsRoot)).map(async (skillRoot) => {
    const skillPath = resolve(skillRoot, "SKILL.md");
    const metadata = frontmatter(await readFile(skillPath, "utf8"), skillPath);
    if (typeof metadata.name !== "string" || typeof metadata.description !== "string") {
      throw new Error(`Skill 缺少字符串 name/description：${skillPath}`);
    }
    const description = normalizedDescription(metadata.description);
    const path = relative(repositoryRoot, skillPath).split(sep).join("/");
    const implicit = await implicitPolicy(skillRoot);
    return {
      name: metadata.name,
      description,
      descriptionCharacters: [...description].length,
      implicit,
      approxTokens: approxCatalogTokens(metadata.name, description, path),
      path,
    } satisfies SkillMetadata;
  }));
  skills.sort((left, right) => left.name.localeCompare(right.name));
  const implicitSkills = skills.filter((skill) => skill.implicit);
  return {
    name: pluginName,
    totalSkills: skills.length,
    implicitSkills: implicitSkills.length,
    explicitOnlySkills: skills.length - implicitSkills.length,
    approxImplicitTokens: implicitSkills.reduce((sum, skill) => sum + skill.approxTokens, 0),
    ...inventory,
    skills,
  };
}

export async function inspectSkillMetadata(pluginNames: string[]): Promise<SkillMetadataReport> {
  const plugins = await Promise.all(pluginNames.toSorted().map(inspectPlugin));
  return {
    schema: "harness-start/skill-metadata-report/v1",
    plugins,
    totals: {
      totalSkills: plugins.reduce((sum, plugin) => sum + plugin.totalSkills, 0),
      implicitSkills: plugins.reduce((sum, plugin) => sum + plugin.implicitSkills, 0),
      explicitOnlySkills: plugins.reduce((sum, plugin) => sum + plugin.explicitOnlySkills, 0),
      approxImplicitTokens: plugins.reduce((sum, plugin) => sum + plugin.approxImplicitTokens, 0),
    },
  };
}

async function defaultPluginNames(): Promise<string[]> {
  const entries = await readdir(pluginsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && existsSync(resolve(pluginsRoot, entry.name, "skills")))
    .map((entry) => entry.name)
    .toSorted();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const selected = args.filter((arg) => arg !== "--json");
  const report = await inspectSkillMetadata(selected.length > 0 ? selected : await defaultPluginNames());
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  for (const plugin of report.plugins) {
    process.stdout.write(`${plugin.name}: ${plugin.implicitSkills}/${plugin.totalSkills} 默认可见，约 ${plugin.approxImplicitTokens} tokens；${plugin.bundledFiles} files，${plugin.bundledBytes} bytes，${plugin.rasterImages} raster images\n`);
  }
  process.stdout.write(`总计：${report.totals.implicitSkills}/${report.totals.totalSkills} 默认可见，约 ${report.totals.approxImplicitTokens} tokens\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();

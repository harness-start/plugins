import { builtinModules } from "node:module";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { build, type BuildResult, type OutputFile } from "esbuild";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pluginsRoot = resolve(repositoryRoot, "plugins");
const checkOnly = process.argv.includes("--check");
const pluginFlag = process.argv.indexOf("--plugin");
const selectedPlugin = pluginFlag >= 0 ? process.argv[pluginFlag + 1] : undefined;
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

async function filesUnder(root: string, extension?: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path, extension));
    else if (!extension || entry.name.endsWith(extension)) found.push(path);
  }
  return found;
}

function assertInside(path: string, parent: string): void {
  const rel = relative(parent, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`unsafe generated path: ${path}`);
  }
}

function validateExternalImports(result: BuildResult): void {
  for (const [output, metadata] of Object.entries(result.metafile?.outputs ?? {})) {
    for (const imported of metadata.imports) {
      if (imported.external && !nodeBuiltins.has(imported.path)) {
        throw new Error(`${output} retains non-Node runtime dependency: ${imported.path}`);
      }
    }
  }
}

async function compilePlugin(pluginRoot: string): Promise<OutputFile[]> {
  const entryRoot = resolve(pluginRoot, "src", "entries");
  const entryPoints = await filesUnder(entryRoot, ".ts");
  if (entryPoints.length === 0) return [];
  const result = await build({
    absWorkingDir: repositoryRoot,
    entryPoints,
    outbase: entryRoot,
    outdir: resolve(pluginRoot, "dist"),
    entryNames: "[dir]/[name]",
    chunkNames: "chunks/[name]-[hash]",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    packages: "bundle",
    platform: "node",
    target: "node20",
    format: "esm",
    splitting: true,
    minify: false,
    sourcemap: false,
    legalComments: "external",
    metafile: true,
    tsconfig: resolve(repositoryRoot, "tsconfig.json"),
    write: false,
    logLevel: "warning",
  });
  validateExternalImports(result);
  return result.outputFiles ?? [];
}

async function compareOutput(pluginRoot: string, outputFiles: OutputFile[]): Promise<void> {
  const distRoot = resolve(pluginRoot, "dist");
  const expected = new Map(outputFiles.map((file) => [resolve(file.path), file.contents]));
  const actualFiles = await filesUnder(distRoot);
  const differences: string[] = [];
  for (const [path, contents] of expected) {
    try {
      const actual = await readFile(path);
      if (!actual.equals(contents)) differences.push(`changed ${relative(repositoryRoot, path)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") differences.push(`missing ${relative(repositoryRoot, path)}`);
      else throw error;
    }
  }
  for (const path of actualFiles) {
    if (!expected.has(resolve(path))) differences.push(`extra ${relative(repositoryRoot, path)}`);
  }
  if (differences.length > 0) throw new Error(differences.join("\n"));
}

async function writeOutput(pluginRoot: string, outputFiles: OutputFile[]): Promise<void> {
  const distRoot = resolve(pluginRoot, "dist");
  assertInside(distRoot, pluginsRoot);
  await rm(distRoot, { recursive: true, force: true });
  for (const file of outputFiles) {
    assertInside(file.path, distRoot);
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents);
  }
}

async function main(): Promise<void> {
  await access(pluginsRoot);
  const entries = await readdir(pluginsRoot, { withFileTypes: true });
  const pluginNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !selectedPlugin || name === selectedPlugin)
    .toSorted();
  if (selectedPlugin && pluginNames.length === 0) throw new Error(`unknown plugin: ${selectedPlugin}`);
  for (const name of pluginNames) {
    const pluginRoot = resolve(pluginsRoot, name);
    const outputFiles = await compilePlugin(pluginRoot);
    if (outputFiles.length === 0) {
      const staleFiles = await filesUnder(resolve(pluginRoot, "dist"));
      if (staleFiles.length > 0) throw new Error(`${name} has dist/ files but no TypeScript entries`);
      continue;
    }
    if (checkOnly) await compareOutput(pluginRoot, outputFiles);
    else await writeOutput(pluginRoot, outputFiles);
    process.stdout.write(`${checkOnly ? "checked" : "built"} ${name}: ${outputFiles.length} file(s)\n`);
  }
}

await main();

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { combinedOutput, runCommand } from "../lib/process-utils.mjs";

const DAY = 24 * 60 * 60 * 1000;
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"];

function findUp(names, from) {
  let current = resolve(from);
  const root = parse(current).root;
  while (true) {
    for (const name of names) { const candidate = join(current, name); if (existsSync(candidate)) return candidate; }
    if (current === root) return null;
    current = dirname(current);
  }
}

function json(path, allowComments = false) {
  try { const text = readFileSync(path, "utf8"); return JSON.parse(allowComments ? text.replace(/\/\/.*$/gmu, "") : text); } catch { return null; }
}

function reserve(id, cwd) {
  const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
  if (!data) return true;
  const path = join(data, "typescript-runtime-guards", `${id}.json`);
  try { if (Date.now() - statSync(path).mtimeMs < DAY) return false; } catch { /* First injection. */ }
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify({ cwd, at: new Date().toISOString() })}\n`); } catch { return false; }
  return true;
}

export function environmentContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd();
  const pkgPath = findUp(["package.json"], cwd);
  const tsconfigPath = findUp(["tsconfig.json"], cwd);
  const denoPath = findUp(["deno.json", "deno.jsonc", "deno.lock"], cwd);
  if (!pkgPath && !tsconfigPath && !denoPath) return null;
  if (!reserve("environment", cwd)) return null;
  const facts = [];
  const pkg = pkgPath ? json(pkgPath) : null;
  if (pkg) {
    if (pkg.name) facts.push(`Project: ${pkg.name}`);
    const projectRoot = dirname(pkgPath);
    if (pkg.packageManager) facts.push(`Package manager: ${pkg.packageManager}`);
    else if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) facts.push("Package manager: pnpm");
    else if (existsSync(join(projectRoot, "yarn.lock"))) facts.push("Package manager: Yarn");
    else if (existsSync(join(projectRoot, "bun.lock")) || existsSync(join(projectRoot, "bun.lockb"))) facts.push("Package manager: Bun");
    else if (existsSync(join(projectRoot, "package-lock.json"))) facts.push("Package manager: npm");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const frameworks = [["@nestjs/core", "NestJS"], ["next", "Next.js"], ["nuxt", "Nuxt"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["express", "Express"]].filter(([key]) => deps[key]).map(([key, name]) => `${name} ${deps[key]}`);
    if (frameworks.length) facts.push(`Frameworks: ${frameworks.join(", ")}`);
    if (deps["@nestjs/core"]) {
      const orms = [["typeorm", "TypeORM"], ["@prisma/client", "Prisma"], ["@mikro-orm/core", "MikroORM"], ["mongoose", "Mongoose"]].filter(([key]) => deps[key]).map(([, name]) => name);
      if (orms.length) facts.push(`NestJS ORM: ${orms.join(", ")}`);
      facts.push(`NestJS compiler: ${deps["@swc/core"] ? "SWC" : "tsc"}`);
    }
  }
  const tsconfig = tsconfigPath ? json(tsconfigPath, true) : null;
  if (tsconfig) {
    const options = tsconfig.compilerOptions ?? {};
    facts.push(`TypeScript: strict=${String(options.strict ?? "unspecified")}, target=${options.target ?? "unspecified"}, module=${options.module ?? "unspecified"}`);
    if (Array.isArray(tsconfig.references)) facts.push(`Project references: ${tsconfig.references.length}`);
    if (options.paths) facts.push(`Path aliases: ${Object.keys(options.paths).slice(0, 5).join(", ")}`);
  }
  if (denoPath) {
    const deno = denoPath.endsWith(".json") || denoPath.endsWith(".jsonc") ? json(denoPath, true) : null;
    facts.push(`Deno config: ${denoPath}`);
    if (deno?.tasks) facts.push(`Deno tasks: ${Object.keys(deno.tasks).slice(0, 5).join(", ")}`);
  }
  return facts.length ? ["[TypeScript/JavaScript Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}

export async function eslintReport(filePath) {
  const target = resolve(filePath);
  if (!/\.(?:[cm]?[jt]sx?)$/iu.test(target)) return null;
  const config = findUp(ESLINT_CONFIGS, dirname(target));
  if (!config) return null;
  const projectRoot = dirname(config);
  const eslint = join(projectRoot, "node_modules", "eslint", "bin", "eslint.js");
  if (!existsSync(eslint)) return null;
  const result = await runCommand(process.execPath, [eslint, "--no-warn-ignored", target], { cwd: projectRoot, timeoutMs: 8000 });
  if (result.exitCode === 0 || result.exitCode === 2) return null;
  const output = combinedOutput(result).trim();
  return output ? `[ESLint] ${output}\n\nFix the reported lint or parser issue; the hook remains fail-open.` : null;
}

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function findUp(name, start) {
  let current = start;
  while (true) {
    const candidate = join(current, name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function frontendEnvironment(cwd) {
  const projectGodot = findUp("project.godot", cwd);
  if (projectGodot) {
    const text = readFileSync(projectGodot, "utf8");
    const version = Number(text.match(/^config_version\s*=\s*(\d+)/mu)?.[1]);
    return `[Godot Env] ${version >= 5 ? "Godot 4.x" : version === 4 ? "Godot 3.x" : "Godot project"}`;
  }
  const packagePath = findUp("package.json", cwd);
  if (!packagePath) return null;
  let pkg;
  try { pkg = JSON.parse(readFileSync(packagePath, "utf8")); } catch { return null; }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const facts = [];
  for (const [dependency, label] of [["react", "React"], ["next", "Next.js"], ["vue", "Vue"], ["nuxt", "Nuxt"], ["svelte", "Svelte"], ["@sveltejs/kit", "SvelteKit"], ["@tarojs/taro", "Taro"], ["vite", "Vite"], ["tailwindcss", "Tailwind CSS"]]) {
    if (deps[dependency]) facts.push(`${label} ${deps[dependency]}`);
  }
  if (!facts.length) return null;
  return `[Frontend Env] Project environment detection\n\n${facts.map((fact) => `  ${fact}`).join("\n")}`;
}

export function stylelintPrimer(cwd) {
  const packagePath = findUp("package.json", cwd);
  if (!packagePath) return null;
  let pkg;
  try { pkg = JSON.parse(readFileSync(packagePath, "utf8")); } catch { return null; }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.react && !deps.vue && !deps.svelte && !deps.tailwindcss && !deps.sass && !deps.less) return null;
  if (deps.stylelint || pkg.stylelint || [".stylelintrc", ".stylelintrc.json", "stylelint.config.js", "stylelint.config.mjs"].some((name) => findUp(name, cwd))) return null;
  return "[Stylelint Coverage] Style files detected but no stylelint dependency or configuration was found. Suggest stylelint; do not rewrite user configuration automatically.";
}

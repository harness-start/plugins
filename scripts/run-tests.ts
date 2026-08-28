import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

export function discoverTypeScriptTests(root = projectRoot): string[] {
  const candidates = [resolve(root, "core", "tests")];
  for (const plugin of readdirSync(resolve(root, "plugins"), { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue;
    candidates.push(resolve(root, "plugins", plugin.name, "tests"));
    const modulesRoot = resolve(root, "plugins", plugin.name, "modules");
    try {
      for (const module of readdirSync(modulesRoot, { withFileTypes: true })) {
        if (module.isDirectory()) candidates.push(resolve(modulesRoot, module.name, "tests"));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return candidates
    .flatMap((directory) => {
      try {
        return filesBelow(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    })
    .filter((path) => path.endsWith(".test.ts"))
    .map((path) => relative(root, path).split("\\").join("/"))
    .toSorted();
}

export function runTypeScriptTests(
  files = discoverTypeScriptTests(),
  cwd = projectRoot,
  stdio: "inherit" | "pipe" = "inherit",
): number {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
    cwd,
    env: environment,
    stdio,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(runTypeScriptTests());
}

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
    if (plugin.isDirectory()) candidates.push(resolve(root, "plugins", plugin.name, "tests"));
  }
  return candidates
    .flatMap((directory) => filesBelow(directory))
    .filter((path) => path.endsWith(".test.ts"))
    .map((path) => relative(root, path).split("\\").join("/"))
    .toSorted();
}

function main(): void {
  const files = discoverTypeScriptTests();
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

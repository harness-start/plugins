import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadExecutableConfig<T>(options: {
  repoRoot: string | null;
  names: readonly string[];
  resolve: (raw: unknown, warn: (message: string) => void) => T;
  warn?: (message: string) => void;
}): Promise<T> {
  const warn = options.warn ?? (() => {});
  if (!options.repoRoot) return options.resolve(null, warn);
  for (const name of options.names) {
    const path = join(options.repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href) as { default?: unknown };
      return options.resolve(loaded.default ?? loaded, warn);
    } catch (error) {
      warn(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return options.resolve(null, warn);
    }
  }
  return options.resolve(null, warn);
}
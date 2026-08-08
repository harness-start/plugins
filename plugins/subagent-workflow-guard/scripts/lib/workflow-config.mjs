import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = Object.freeze({ dispatch: "workflow" });
const MODES = new Set(["workflow", "block", "report", "off"]);

export function resolveConfig(raw, warn = () => {}) {
  const value = raw?.dispatch;
  if (value === undefined) return { ...DEFAULT_CONFIG };
  if (!MODES.has(value)) {
    warn(`invalid dispatch mode: ${String(value)}; using workflow`);
    return { ...DEFAULT_CONFIG };
  }
  return { dispatch: value };
}

export async function loadConfig(cwd, warn = () => {}) {
  for (const name of [".subagent-workflow-guard.mjs", ".subagent-workflow-guard.js", ".subagent-workflow-guard.cjs"]) {
    const path = join(cwd, name);
    try {
      await access(path);
      const mod = await import(pathToFileURL(path).href);
      return resolveConfig(mod.default ?? mod, warn);
    } catch (error) {
      if (error?.code !== "ENOENT") warn(`failed to load ${name}: ${error?.message ?? error}`);
    }
  }
  for (const legacy of [".subagent-discipline.mjs", ".subagent-discipline.js", ".subagent-discipline.cjs"]) {
    try {
      await access(join(cwd, legacy));
      warn(`${legacy} is no longer loaded; migrate to .subagent-workflow-guard.mjs with one dispatch key`);
      break;
    } catch {
      // Optional legacy file.
    }
  }
  return { ...DEFAULT_CONFIG };
}

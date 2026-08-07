import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const NAMES = [
  ".project-instruction-guard.mjs",
  ".project-instruction-guard.cjs",
  ".project-instruction-guard.js",
];

export const DEFAULT_CONFIG = Object.freeze({ mode: "block" });

export async function loadConfig(root, warn = () => {}) {
  const path = NAMES.map((name) => join(root, name)).find(existsSync);
  if (!path) return { config: { ...DEFAULT_CONFIG }, path: null };
  try {
    const imported = await import(`${pathToFileURL(path).href}?project-instruction-guard=${Date.now()}`);
    const source = imported.default ?? imported;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("default export must be an object");
    }
    const keys = Object.keys(source);
    if (keys.some((key) => key !== "mode")) throw new Error("only the mode field is supported");
    if (source.mode !== undefined && !["block", "report", "off"].includes(source.mode)) {
      throw new Error("mode must be block, report, or off");
    }
    return { config: { mode: source.mode ?? DEFAULT_CONFIG.mode }, path };
  } catch (error) {
    warn(`invalid ${path}; using mode=block: ${error instanceof Error ? error.message : String(error)}`);
    return { config: { ...DEFAULT_CONFIG }, path };
  }
}

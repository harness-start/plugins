import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_HYGIENE } from "./hygiene.mjs";

/**
 * Load optional <git-root>/.subagent-discipline.mjs
 * @returns {Promise<{ evidence: object }>}
 */
export async function loadConfig(gitRoot) {
  const base = { evidence: { ...DEFAULT_HYGIENE } };
  if (!gitRoot) return base;

  for (const name of [
    ".subagent-discipline.mjs",
    ".subagent-discipline.js",
    ".subagent-discipline.cjs",
  ]) {
    const path = join(gitRoot, name);
    if (!existsSync(path)) continue;
    try {
      const mod = await import(pathToFileURL(path).href);
      const conf = mod.default ?? mod;
      if (conf && typeof conf === "object") {
        return {
          evidence: {
            ...DEFAULT_HYGIENE,
            ...(conf.evidence && typeof conf.evidence === "object"
              ? conf.evidence
              : conf),
          },
        };
      }
    } catch {
      // fall through
    }
  }
  return base;
}

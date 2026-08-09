import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  auditRoot: ".file-access-audit",
});

const CONFIG_NAMES = [
  ".file-access-audit.mjs",
  ".file-access-audit.cjs",
  ".file-access-audit.js",
];

const RESERVED_ROOTS = new Set([
  "src",
  "lib",
  "app",
  "apps",
  "packages",
  "tmp",
  "temp",
  "logs",
  "log",
  "out",
  "dist",
  "build",
  "node_modules",
  "vendor",
  "test",
  "tests",
]);

export function resolveConfig(raw, warn = () => {}) {
  const config = {
    enabled: DEFAULT_CONFIG.enabled,
    auditRoot: DEFAULT_CONFIG.auditRoot,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (raw != null) warn("config must be an object; using defaults");
    return config;
  }
  if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
  else if (raw.enabled !== undefined) warn("enabled must be boolean");

  if (typeof raw.auditRoot === "string" && raw.auditRoot.trim()) {
    const root = raw.auditRoot.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
    const base = root.split("/").filter(Boolean)[0] ?? "";
    if (
      !root
      || root.includes("..")
      || isAbsolute(root)
      || /^[A-Za-z]:\//u.test(root)
      || RESERVED_ROOTS.has(base.toLowerCase())
    ) {
      warn("auditRoot must be a relative non-reserved path without ..; using default");
    } else {
      config.auditRoot = root;
    }
  } else if (raw.auditRoot !== undefined) {
    warn("auditRoot must be a non-empty string");
  }

  return config;
}

export async function loadProjectConfig(repoRoot, warn = () => {}) {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return resolveConfig(loaded.default ?? loaded, warn);
    } catch (error) {
      warn(`failed to load ${name}: ${error?.message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}

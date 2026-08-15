import { isAbsolute } from "node:path";
import { isRecord } from "@harness/core/hook-event";
import { loadExecutableConfig } from "@harness/core/project-config";

export type FileAccessConfig = {
  enabled: boolean;
  auditRoot: string;
};

type WarnFn = (message: string) => void;

export const DEFAULT_CONFIG: Readonly<FileAccessConfig> = Object.freeze({
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

export function resolveConfig(raw: unknown, warn: WarnFn = () => {}): FileAccessConfig {
  const config: FileAccessConfig = {
    enabled: DEFAULT_CONFIG.enabled,
    auditRoot: DEFAULT_CONFIG.auditRoot,
  };
  if (!isRecord(raw)) {
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

export async function loadProjectConfig(
  repoRoot: string | null,
  warn: WarnFn = () => {},
): Promise<FileAccessConfig> {
  return loadExecutableConfig({
    repoRoot,
    names: CONFIG_NAMES,
    resolve: resolveConfig,
    warn,
  });
}

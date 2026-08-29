import { isAbsolute } from "node:path";
import { isRecord } from "@harness/core/hook-event";
import { loadExecutableConfig } from "@harness/core/project-config";

export type AgentActivityConfig = {
  enabled: boolean;
  auditRoot: string;
  maxCommandChars: number;
  redactSecrets: boolean;
};

type WarnFn = (message: string) => void;

export const DEFAULT_CONFIG: Readonly<AgentActivityConfig> = Object.freeze({
  enabled: true,
  auditRoot: ".agent-activity-audit",
  maxCommandChars: 2000,
  redactSecrets: true,
});

const CONFIG_NAMES = [
  ".agent-activity-audit.mjs",
  ".agent-activity-audit.cjs",
  ".agent-activity-audit.js",
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

export function resolveConfig(raw: unknown, warn: WarnFn = () => {}): AgentActivityConfig {
  const config: AgentActivityConfig = {
    enabled: DEFAULT_CONFIG.enabled,
    auditRoot: DEFAULT_CONFIG.auditRoot,
    maxCommandChars: DEFAULT_CONFIG.maxCommandChars,
    redactSecrets: DEFAULT_CONFIG.redactSecrets,
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

  if (typeof raw.maxCommandChars === "number" && Number.isFinite(raw.maxCommandChars)) {
    const value = Math.floor(raw.maxCommandChars);
    if (value < 64 || value > 20_000) warn("maxCommandChars must be 64..20000; using default");
    else config.maxCommandChars = value;
  } else if (raw.maxCommandChars !== undefined) {
    warn("maxCommandChars must be a number");
  }

  if (raw.redactSecrets === false) warn("redactSecrets cannot be disabled; command redaction remains enabled");
  else if (raw.redactSecrets !== undefined && raw.redactSecrets !== true) {
    warn("redactSecrets must be true");
  }

  return config;
}

export async function loadProjectConfig(
  repoRoot: string | null,
  warn: WarnFn = () => {},
): Promise<AgentActivityConfig> {
  return loadExecutableConfig({
    repoRoot,
    names: CONFIG_NAMES,
    resolve: resolveConfig,
    warn,
  });
}

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = Object.freeze({
  auditRoot: ".goal-task",
  tipWindow: 3,
  minRows: 2,
  sessionTtlHours: 48,
  softOnly: false,
  stopGate: Object.freeze({
    mode: "block", // block | report | off
    softSparseWhileArmed: true,
    sparseMinRows: 1,
  }),
  gitignoreEnsure: true,
  abortToken: "# goal-task-abort",
});

const CONFIG_NAMES = [
  ".goal-task-gate.mjs",
  ".goal-task-gate.cjs",
  ".goal-task-gate.js",
];

function cloneDefault() {
  return {
    auditRoot: DEFAULT_CONFIG.auditRoot,
    tipWindow: DEFAULT_CONFIG.tipWindow,
    minRows: DEFAULT_CONFIG.minRows,
    sessionTtlHours: DEFAULT_CONFIG.sessionTtlHours,
    softOnly: DEFAULT_CONFIG.softOnly,
    stopGate: { ...DEFAULT_CONFIG.stopGate },
    gitignoreEnsure: DEFAULT_CONFIG.gitignoreEnsure,
    abortToken: DEFAULT_CONFIG.abortToken,
  };
}

function asMode(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function asPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asTipWindow(value, fallback) {
  const n = Number(value);
  if (n === 2 || n === 3) return n;
  return fallback;
}

function normalizeAuditRoot(value) {
  const candidate = value.trim().replaceAll("\\", "/");
  if (/^(?:\/|[A-Za-z]:)/u.test(candidate)) return null;

  const segments = candidate.split("/");
  if (segments.includes("..")) return null;

  const normalized = segments
    .filter((segment) => segment && segment !== ".")
    .join("/");
  return normalized || null;
}

export function resolveConfig(raw, warn = () => {}) {
  const config = cloneDefault();
  if (!raw || typeof raw !== "object") return config;

  if (typeof raw.auditRoot === "string" && raw.auditRoot.trim()) {
    const auditRoot = normalizeAuditRoot(raw.auditRoot);
    if (auditRoot) {
      config.auditRoot = auditRoot;
    } else {
      warn("invalid auditRoot: use a relative directory inside the repository root");
    }
  }
  if (raw.tipWindow !== undefined) {
    config.tipWindow = asTipWindow(raw.tipWindow, config.tipWindow);
    if (raw.tipWindow !== 2 && raw.tipWindow !== 3) {
      warn(`invalid tipWindow: ${raw.tipWindow} (use 2 or 3)`);
    }
  }
  if (raw.minRows !== undefined) {
    config.minRows = asPositiveNumber(raw.minRows, config.minRows);
  }
  if (raw.sessionTtlHours !== undefined) {
    config.sessionTtlHours = asPositiveNumber(raw.sessionTtlHours, config.sessionTtlHours);
  }
  if (typeof raw.softOnly === "boolean") {
    config.softOnly = raw.softOnly;
  }
  if (typeof raw.gitignoreEnsure === "boolean") {
    config.gitignoreEnsure = raw.gitignoreEnsure;
  }
  if (typeof raw.abortToken === "string" && raw.abortToken.trim()) {
    config.abortToken = raw.abortToken.trim();
  }
  if (raw.stopGate && typeof raw.stopGate === "object") {
    config.stopGate.mode = asMode(
      raw.stopGate.mode,
      ["block", "report", "off"],
      config.stopGate.mode,
    );
    if (typeof raw.stopGate.softSparseWhileArmed === "boolean") {
      config.stopGate.softSparseWhileArmed = raw.stopGate.softSparseWhileArmed;
    }
    if (raw.stopGate.sparseMinRows !== undefined) {
      config.stopGate.sparseMinRows = asPositiveNumber(
        raw.stopGate.sparseMinRows,
        config.stopGate.sparseMinRows,
      );
    }
  }
  return config;
}

export async function loadProjectConfig(repoRoot, warn = () => {}) {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const mod = await import(pathToFileURL(path).href);
      const raw = mod?.default ?? mod;
      return resolveConfig(raw, warn);
    } catch (error) {
      warn(`failed to load ${name}: ${error?.message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}

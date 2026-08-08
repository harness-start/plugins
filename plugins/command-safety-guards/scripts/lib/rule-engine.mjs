/**
 * Declarative command-safety rule engine.
 *
 * User config (.command-safety-guards.mjs) rules are prepended to built-ins.
 * First match wins. Non-regex checks live under scripts/engines/.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILTIN_RULES } from "./builtin-rules.mjs";
import { sanitizeCommand } from "./sanitize-command.mjs";

export { BUILTIN_RULES };

const CONFIG_FILE_NAMES = [
  ".command-safety-guards.mjs",
  ".command-safety-guards.cjs",
  ".command-safety-guards.js",
];

export const DEFAULT_SETTINGS = {
  engines: {
    dangerousRm: true,
    mysqlReplicationPreflight: true,
    secretRead: true,
    fileSafety: true,
    denyEscalation: true,
  },
  escalation: {
    windowMinutes: 10,
    threshold: 3,
  },
};

function isMatcher(value) {
  return (
    value instanceof RegExp ||
    (value && typeof value === "object" && typeof value.test === "function")
  );
}

function testMatcher(matcher, subject) {
  if (matcher instanceof RegExp) {
    return new RegExp(matcher.source, matcher.flags).test(subject);
  }
  return matcher.test(subject);
}

/** Validate a user-supplied rule. Built-ins are trusted. */
export function validateRule(rule, i) {
  if (!rule || typeof rule !== "object") {
    process.stderr.write(
      `[command-safety-guards] rule[${i}]: must be an object, skipping\n`,
    );
    return false;
  }
  if (!(rule.match instanceof RegExp)) {
    process.stderr.write(
      `[command-safety-guards] rule[${i}]: "match" must be a RegExp, skipping\n`,
    );
    return false;
  }
  const mode = rule.mode ?? "deny";
  if (!["deny", "report", "allow"].includes(mode)) {
    process.stderr.write(
      `[command-safety-guards] rule[${i}]: "mode" must be deny|report|allow, skipping\n`,
    );
    return false;
  }
  return true;
}

/** Merge user rules (prepended) with built-ins. */
export function resolveRules(userConfig) {
  const config =
    userConfig && typeof userConfig === "object" && !Array.isArray(userConfig)
      ? userConfig
      : {};
  const rawUser = Array.isArray(config.rules) ? config.rules : [];
  if (config.rules !== undefined && !Array.isArray(config.rules)) {
    process.stderr.write(
      `[command-safety-guards] config "rules" must be an array, using built-ins\n`,
    );
  }
  const userRules = rawUser
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule, i }) => validateRule(rule, i))
    .map(({ rule, i }) => ({
      id: typeof rule.id === "string" && rule.id ? rule.id : `user-rule[${i}]`,
      match: rule.match,
      mode: rule.mode ?? "deny",
      title: rule.title,
      reason: rule.reason,
      recovery: rule.recovery,
      observedFacts: rule.observedFacts,
      harm: rule.harm,
      unblockWhen: rule.unblockWhen,
      sensitive: Boolean(rule.sensitive),
    }));

  return {
    rules: [...userRules, ...BUILTIN_RULES],
    settings: {
      engines: {
        ...DEFAULT_SETTINGS.engines,
        ...(config.settings?.engines &&
        typeof config.settings.engines === "object" &&
        !Array.isArray(config.settings.engines)
          ? config.settings.engines
          : {}),
      },
      escalation: {
        ...DEFAULT_SETTINGS.escalation,
        ...(config.settings?.escalation &&
        typeof config.settings.escalation === "object" &&
        !Array.isArray(config.settings.escalation)
          ? config.settings.escalation
          : {}),
      },
    },
  };
}

/** First rule whose match succeeds on the (optionally sanitized) command. */
export function matchRule(command, rules, options = {}) {
  const { sanitize = true } = options;
  if (typeof command !== "string" || !command) return null;
  const subject = sanitize ? sanitizeCommand(command) : command;
  for (const rule of rules) {
    if (!isMatcher(rule.match)) continue;
    try {
      if (testMatcher(rule.match, subject)) return rule;
    } catch {
      continue;
    }
  }
  return null;
}

function resolveReason(rule, command) {
  if (typeof rule.resolveReason === "function") {
    return rule.resolveReason(command);
  }
  return rule.reason || `matched rule ${rule.id}`;
}

/** Format a deny/report message for a matched rule. */
export function formatFinding(rule, command) {
  if (typeof rule.formatMessage === "function") {
    return rule.formatMessage(command);
  }

  const title = rule.title || rule.id || "Command Safety";
  const reason = resolveReason(rule, command);
  const recovery =
    rule.recovery || "Adjust the command and retry, or declare an allow rule in the project configuration.";

  if (rule.mode === "report") {
    return [
      `[${title}] Risk notice`,
      "",
      `Reason: ${reason}`,
      `Recovery/alternative: ${recovery}`,
      `Command: ${command}`,
    ].join("\n");
  }

  return [
    `[${title}] Blocked`,
    "",
    `Reason: ${reason}`,
    `Recovery/alternative: ${recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    `  observedFacts: ${rule.observedFacts || "The command matched a declarative command-safety-guards rule."}`,
    `  harm: ${rule.harm || "It may cause data loss, out-of-scope testing, credential exposure, or unrecoverable changes."}`,
    `  unblockWhen: ${rule.unblockWhen || "Provide authorization, scope, backup, or a safe alternative, or add a precise allow rule."}`,
    `  recovery: ${recovery}`,
  ].join("\n");
}

/** Resolve git project root from cwd; null if unavailable. */
export function resolveRepoRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      cwd,
    }).trim();
  } catch {
    return null;
  }
}

/** Load user config from project root. Returns default export or null. */
export async function loadUserConfig(repoRoot) {
  if (!repoRoot) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const mod = await import(pathToFileURL(path).href);
      return mod.default ?? mod;
    } catch (error) {
      process.stderr.write(
        `[command-safety-guards] Failed to load ${name}: ${error.message}\n`,
      );
      return null;
    }
  }
  return null;
}

/** Convenience: load + resolve from a cwd. */
export async function loadResolvedConfig(cwd = process.cwd()) {
  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  return { repoRoot, userConfig, ...resolveRules(userConfig) };
}

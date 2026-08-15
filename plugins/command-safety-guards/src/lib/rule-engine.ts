/**
 * Declarative command-safety rule engine.
 *
 * User config (.command-safety-guards.mjs) rules are prepended to built-ins.
 * First match wins. Non-regex checks live under src/engines/.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isRecord } from "@harness/core/hook-event";
import {
  BUILTIN_RULES,
  type CommandMatcher,
  type RuleMode,
  type SafetyRule,
} from "./builtin-rules.js";
import { sanitizeCommand } from "./sanitize-command.js";

export { BUILTIN_RULES };
export type { CommandMatcher, RuleMode, SafetyRule };

const CONFIG_FILE_NAMES = [
  ".command-safety-guards.mjs",
  ".command-safety-guards.cjs",
  ".command-safety-guards.js",
];

export type EngineSettings = {
  dangerousRm: boolean;
  mysqlReplicationPreflight: boolean;
  secretRead: boolean;
  fileSafety: boolean;
  denyEscalation: boolean;
};

export type EscalationSettings = {
  windowMinutes: number;
  threshold: number;
};

export type SafetySettings = {
  engines: EngineSettings;
  escalation: EscalationSettings;
};

export type ResolvedRules = {
  rules: SafetyRule[];
  settings: SafetySettings;
};

export const DEFAULT_SETTINGS: SafetySettings = {
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

type UserRuleInput = {
  id?: unknown;
  match: RegExp;
  mode?: unknown;
  title?: unknown;
  reason?: unknown;
  recovery?: unknown;
  observedFacts?: unknown;
  harm?: unknown;
  unblockWhen?: unknown;
  sensitive?: unknown;
};

function isMatcher(value: unknown): value is CommandMatcher {
  return (
    value instanceof RegExp ||
    (isRecord(value) && typeof value.test === "function")
  );
}

function testMatcher(matcher: CommandMatcher, subject: string): boolean {
  if (matcher instanceof RegExp) {
    return new RegExp(matcher.source, matcher.flags).test(subject);
  }
  return matcher.test(subject);
}

function isRuleMode(value: unknown): value is RuleMode {
  return value === "deny" || value === "report" || value === "allow";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveEngineSettings(raw: unknown): EngineSettings {
  const engines: EngineSettings = { ...DEFAULT_SETTINGS.engines };
  if (!isRecord(raw)) return engines;
  if (typeof raw.dangerousRm === "boolean") engines.dangerousRm = raw.dangerousRm;
  if (typeof raw.mysqlReplicationPreflight === "boolean") {
    engines.mysqlReplicationPreflight = raw.mysqlReplicationPreflight;
  }
  if (typeof raw.secretRead === "boolean") engines.secretRead = raw.secretRead;
  if (typeof raw.fileSafety === "boolean") engines.fileSafety = raw.fileSafety;
  if (typeof raw.denyEscalation === "boolean") engines.denyEscalation = raw.denyEscalation;
  return engines;
}

function resolveEscalationSettings(raw: unknown): EscalationSettings {
  const escalation: EscalationSettings = { ...DEFAULT_SETTINGS.escalation };
  if (!isRecord(raw)) return escalation;
  if (typeof raw.windowMinutes === "number") escalation.windowMinutes = raw.windowMinutes;
  if (typeof raw.threshold === "number") escalation.threshold = raw.threshold;
  return escalation;
}

/** Validate a user-supplied rule. Built-ins are trusted. */
export function validateRule(rule: unknown, i: number): rule is UserRuleInput {
  if (!rule || typeof rule !== "object") {
    process.stderr.write(
      `[command-safety-guards] rule[${i}]: must be an object, skipping\n`,
    );
    return false;
  }
  if (!("match" in rule) || !(rule.match instanceof RegExp)) {
    process.stderr.write(
      `[command-safety-guards] rule[${i}]: "match" must be a RegExp, skipping\n`,
    );
    return false;
  }
  const mode = "mode" in rule ? rule.mode ?? "deny" : "deny";
  if (!isRuleMode(mode)) {
    process.stderr.write(
      `[command-safety-guards] rule[${i}]: "mode" must be deny|report|allow, skipping\n`,
    );
    return false;
  }
  return true;
}

/** Merge user rules (prepended) with built-ins. */
export function resolveRules(userConfig: unknown): ResolvedRules {
  const config = isRecord(userConfig) ? userConfig : {};
  const rawUser = Array.isArray(config.rules) ? config.rules : [];
  if (config.rules !== undefined && !Array.isArray(config.rules)) {
    process.stderr.write(
      `[command-safety-guards] config "rules" must be an array, using built-ins\n`,
    );
  }
  const userRules = rawUser
    .map((rule, i) => ({ rule, i }))
    .filter((item): item is { rule: UserRuleInput; i: number } => validateRule(item.rule, item.i))
    .map(({ rule, i }) => {
      const mode = isRuleMode(rule.mode) ? rule.mode : "deny";
      return {
        id: typeof rule.id === "string" && rule.id ? rule.id : `user-rule[${i}]`,
        match: rule.match,
        mode,
        title: optionalString(rule.title),
        reason: optionalString(rule.reason),
        recovery: optionalString(rule.recovery),
        observedFacts: optionalString(rule.observedFacts),
        harm: optionalString(rule.harm),
        unblockWhen: optionalString(rule.unblockWhen),
        sensitive: Boolean(rule.sensitive),
      } satisfies SafetyRule;
    });

  const settingsSource = isRecord(config.settings) ? config.settings : null;
  return {
    rules: [...userRules, ...BUILTIN_RULES],
    settings: {
      engines: resolveEngineSettings(settingsSource?.engines),
      escalation: resolveEscalationSettings(settingsSource?.escalation),
    },
  };
}

/** First rule whose match succeeds on the (optionally sanitized) command. */
export function matchRule(
  command: unknown,
  rules: readonly SafetyRule[],
  options: { sanitize?: boolean | undefined } = {},
): SafetyRule | null {
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

function resolveReason(rule: SafetyRule, command: string): string {
  if (typeof rule.resolveReason === "function") {
    return rule.resolveReason(command);
  }
  return rule.reason || `matched rule ${rule.id}`;
}

/** Format a deny/report message for a matched rule. */
export function formatFinding(rule: SafetyRule, command: string): string {
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
export function resolveRepoRoot(cwd = process.cwd()): string | null {
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
export async function loadUserConfig(repoRoot: string | null | undefined): Promise<unknown> {
  if (!repoRoot) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded: unknown = await import(pathToFileURL(path).href);
      if (!isRecord(loaded)) return loaded;
      return loaded.default ?? loaded;
    } catch (error: unknown) {
      const message = isRecord(error) && error.message != null ? String(error.message) : String(error);
      process.stderr.write(
        `[command-safety-guards] Failed to load ${name}: ${message}\n`,
      );
      return null;
    }
  }
  return null;
}

/** Convenience: load + resolve from a cwd. */
export async function loadResolvedConfig(cwd = process.cwd()): Promise<{
  repoRoot: string | null;
  userConfig: unknown;
  rules: SafetyRule[];
  settings: SafetySettings;
}> {
  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  return { repoRoot, userConfig, ...resolveRules(userConfig) };
}

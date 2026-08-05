/**
 * Webman environment detection (UserPromptSubmit).
 *
 * Detects Webman framework version, Workerman version, installed webman
 * extensions and key dependencies from composer.json, and injects a compact
 * context block once per session (24h cooldown).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const HOOK_ID = "webman-env-detector";
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Prompt signals (used by the hook matcher and in-script filtering). */
export const SIGNALS = [
  /\bwebman\b/i,
  /\bworkerman\b/i,
];

/** Execution verbs: a question-only prompt without these is skipped. */
export const EXECUTION_SIGNALS = [
  /\b(?:build|compile|configure|debug|diagnose|fix|implement|install|lint|migrate|refactor|review|run|test|upgrade)\b/i,
  /实现|修改|修复|重构|构建|编译|配置|安装|迁移|升级|测试|排查|诊断|审查|运行/u,
];

export function findUpNamed(name, start) {
  let current = start;
  while (typeof current === "string" && current.length > 0) {
    if (existsSync(join(current, name))) return join(current, name);
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function stringRecord(value) {
  return Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry) => typeof entry[1] === "string",
    ),
  );
}

function readComposerJson(path) {
  try {
    const composer = record(JSON.parse(readFileSync(path, "utf-8")));
    return {
      name: typeof composer.name === "string" ? composer.name : undefined,
      require: stringRecord(composer.require),
    };
  } catch {
    return null;
  }
}

/** Returns the context block to inject, or null when not a Webman project. */
export function detectFacts(cwd) {
  const composerPath = findUpNamed("composer.json", cwd);
  if (!composerPath) return null;

  const composer = readComposerJson(composerPath);
  if (!composer) return null;

  const req = composer.require;
  const webmanPkg =
    req["workerman/webman-framework"] ||
    req["webman/framework"];
  if (!webmanPkg) return null;

  const facts = [];

  facts.push(`Webman: ${webmanPkg}`);
  if (req["workerman/workerman"]) {
    facts.push(`Workerman: ${req["workerman/workerman"]}`);
  }
  if (req.php) facts.push(`PHP version constraint: ${req.php}`);
  if (composer.name) facts.push(`Project name: ${composer.name}`);

  const extensions = [];
  for (const pkg of Object.keys(req)) {
    if (pkg.startsWith("webman/") && pkg !== "webman/framework") {
      extensions.push(pkg.replace("webman/", ""));
    }
  }
  if (extensions.length > 0) {
    facts.push(`Webman extensions: ${extensions.join(", ")}`);
  }

  const notable = [];
  if (req["illuminate/database"]) notable.push("illuminate/database");
  if (req["topthink/think-orm"]) notable.push("ThinkORM");
  if (req["vlucas/phpdotenv"]) notable.push("phpdotenv");
  if (req["twig/twig"]) notable.push("Twig");
  if (req["blade-ui-kit/blade-icons"] || req["jenssegers/blade"]) notable.push("Blade");
  if (notable.length > 0) facts.push(`Key dependencies: ${notable.join(", ")}`);

  if (facts.length === 0) return null;
  return [
    "[Webman Env] Project environment detection",
    "",
    ...facts.map((fact) => `  ${fact}`),
  ].join("\n");
}

export function isQuestionOnlyPrompt(prompt) {
  return (
    /[?？]$/.test(prompt.trim()) &&
    !EXECUTION_SIGNALS.some((signal) => signal.test(prompt))
  );
}

export function shouldInject(prompt) {
  if (typeof prompt !== "string" || prompt.length < 8 || prompt.startsWith("/")) {
    return false;
  }
  if (!SIGNALS.some((signal) => signal.test(prompt))) return false;
  if (isQuestionOnlyPrompt(prompt)) return false;
  return true;
}

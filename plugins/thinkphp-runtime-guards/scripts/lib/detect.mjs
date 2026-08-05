/**
 * ThinkPHP environment detection (UserPromptSubmit).
 *
 * Detects ThinkPHP from Composer metadata or the legacy application layout.
 * Both signals matter because older ThinkPHP deployments often predate a
 * reliable Composer dependency graph.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const HOOK_ID = "thinkphp-env-detector";
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Prompt signals (used by the hook matcher and in-script filtering). */
export const SIGNALS = [
  /\bthinkphp\b/i,
  /\bfastadmin\b/i,
  /\btopthink\/framework\b/i,
  /(?:^|\/)Application\//i,
  /\.class\.php\b/i,
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

/** Returns the context block to inject, or null when not a ThinkPHP project. */
export function detectFacts(cwd) {
  const composerPath = findUpNamed("composer.json", cwd);
  let composer = {};
  if (composerPath) {
    try {
      composer = JSON.parse(readFileSync(composerPath, "utf8"));
    } catch {
      // Legacy ThinkPHP projects may have unusable Composer metadata, so
      // layout detection remains available as the independent fallback.
      composer = {};
    }
  }
  const root = composerPath ? dirname(composerPath) : cwd;
  const require = composer && typeof composer.require === "object" && composer.require
    ? composer.require
    : {};
  const version = require["topthink/framework"];
  const legacyLayout = existsSync(join(root, "ThinkPHP")) || existsSync(join(root, "Application"));
  const modernLayout = existsSync(join(root, "think")) || existsSync(join(root, "app"));
  if (typeof version !== "string" && !legacyLayout) return null;

  const facts = [
    typeof version === "string" ? `Framework: ThinkPHP ${version}` : null,
    legacyLayout ? "Layout: legacy ThinkPHP Application/ThinkPHP" : null,
    modernLayout ? "Layout: modern app/think entry" : null,
  ].filter((value) => value !== null);

  return [
    "[ThinkPHP Env] Project environment detection",
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

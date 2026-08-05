/**
 * Laravel environment detection (UserPromptSubmit).
 *
 * Detects Laravel version, key packages and APP_ENV from composer.json +
 * .env, and injects a compact context block once per session (24h cooldown),
 * mirroring the source harness env-detector.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const HOOK_ID = "laravel-env-detector";
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Prompt signals (used by the hook matcher and in-script filtering). */
export const SIGNALS = [
  /\blaravel\b/i,
  /\bartisan\b/i,
  /\bcomposer\.json\b/i,
  /\bblade\b/i,
  /\bpest\b/i,
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
      require: stringRecord(composer.require),
      requireDev: stringRecord(composer["require-dev"]),
    };
  } catch {
    return null;
  }
}

function readAppEnv(projectRoot) {
  try {
    const envFile = join(projectRoot, ".env");
    if (!existsSync(envFile)) return null;
    const content = readFileSync(envFile, "utf-8");
    // APP_ENV is the only .env value surfaced so detection cannot accidentally
    // inject credentials from adjacent entries.
    const match = content.match(/^APP_ENV\s*=\s*(\S+)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Returns the context block to inject, or null when not a Laravel project. */
export function detectFacts(cwd) {
  const composerPath = findUpNamed("composer.json", cwd);
  if (!composerPath) return null;

  const composer = readComposerJson(composerPath);
  if (!composer) return null;

  const req = composer.require;
  if (!req["laravel/framework"]) return null;

  const projectRoot = dirname(composerPath);
  const facts = [];

  facts.push(`Laravel: ${req["laravel/framework"]}`);
  if (req.php) facts.push(`PHP version constraint: ${req.php}`);
  if (existsSync(join(projectRoot, "artisan"))) facts.push("artisan: yes");

  const packages = [];
  if (req["laravel/sanctum"]) packages.push(`Sanctum ${req["laravel/sanctum"]}`);
  if (req["laravel/horizon"]) packages.push(`Horizon ${req["laravel/horizon"]}`);
  if (req["laravel/nova"]) packages.push("Nova");
  if (req["laravel/octane"]) packages.push(`Octane ${req["laravel/octane"]}`);
  if (req["laravel/livewire"] || req["livewire/livewire"]) packages.push("Livewire");
  if (req["inertiajs/inertia-laravel"]) packages.push("Inertia");
  if (req["laravel/cashier"]) packages.push("Cashier");
  if (req["laravel/scout"]) packages.push("Scout");
  if (packages.length > 0) facts.push(`Key packages: ${packages.join(", ")}`);

  const devReq = composer.requireDev;
  if (devReq["pestphp/pest"]) {
    facts.push("Testing: Pest");
  } else if (devReq["phpunit/phpunit"]) {
    facts.push("Testing: PHPUnit");
  }

  const appEnv = readAppEnv(projectRoot);
  if (appEnv) facts.push(`APP_ENV: ${appEnv}`);

  if (facts.length === 0) return null;
  return [
    "[Laravel Env] Project environment detection",
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

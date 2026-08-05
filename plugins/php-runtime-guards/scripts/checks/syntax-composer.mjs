/**
 * composer validate check (PostToolUse).
 *
 * Validates the edited composer.json with
 * `composer validate --no-check-publish --no-check-lock`. Warnings from the
 * global auth.json schema or internal exact-version notes are not actionable
 * here, so only real validation errors are surfaced.
 *
 * Failure mode: fail-open (report — PostToolUse cannot deny on either host).
 */

import { dirname } from "node:path";
import { hasCommand, runCommand, combinedOutput } from "../lib/process-utils.mjs";
import { matchName } from "../lib/matchers.mjs";

const VALIDATE_ARGS = ["validate", "--no-check-publish", "--no-check-lock"];
const VALIDATE_TIMEOUT_MS = 8000;

export function matches(filePath) {
  return matchName(filePath, ["composer.json"]);
}

export function isComposerValidateBlockingOutput(output) {
  const normalized = output.toLowerCase();
  if (!normalized.trim()) return false;
  // "is valid" marks a clean validation run (possibly with global notices).
  if (normalized.includes("is valid")) return false;
  return true;
}

export async function check(filePath) {
  if (!hasCommand("composer")) return null;
  const cwd = dirname(filePath);
  const result = await runCommand("composer", VALIDATE_ARGS, { cwd, timeoutMs: VALIDATE_TIMEOUT_MS });
  if (result.exitCode === 0) return null;
  const output = combinedOutput(result);
  if (!isComposerValidateBlockingOutput(output)) return null;
  return output.trim() ? { lang: "Composer Validate", message: output } : null;
}

export function formatFailure(failure, filePath) {
  return `[${failure.lang}] ${failure.message.trim()}\n\n请修复后再继续。`;
}

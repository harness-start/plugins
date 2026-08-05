/**
 * php -l syntax check (PostToolUse).
 *
 * Runs `php -l` on the edited file. Requires the `php` binary; when missing
 * the check silently passes (fail-open).
 *
 * Failure mode: fail-open (report — PostToolUse cannot deny on either host).
 */

import { hasCommand, runCommand, combinedOutput } from "../lib/process-utils.mjs";
import { matchExt } from "../lib/matchers.mjs";

const LINT_TIMEOUT_MS = 8000;

export function matches(filePath) {
  return matchExt(filePath, [".php"]);
}

export async function check(filePath) {
  if (!hasCommand("php")) return null;
  const result = await runCommand("php", ["-l", filePath], { timeoutMs: LINT_TIMEOUT_MS });
  if (result.exitCode === 0) return null;
  const output = combinedOutput(result);
  return output.trim() ? { lang: "PHP Syntax", message: output } : null;
}

export function formatFailure(failure, filePath) {
  return `[${failure.lang}] ${failure.message.trim()}\n\n请修复后再继续。`;
}

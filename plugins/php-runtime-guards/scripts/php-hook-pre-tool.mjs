#!/usr/bin/env node
/**
 * php-runtime-guards PreToolUse entry.
 *
 * One process per event, dispatching to five checks:
 *   1. composer.json `repositories` key            (deny, fail-closed)
 *   2. composer.json Chinese unicode escapes       (deny, fail-closed)
 *   3. composer.lock direct / shell writes         (deny, fail-closed)
 *   4. protected generated paths (vendor/ etc.)    (deny, fail-closed)
 *   5. test output truncation (Bash)               (report)
 *
 * Write tools and shell tools share the same process; the first deny wins,
 * otherwise a report may be emitted. A clean run exits 0 without output.
 */

import {
  readStdinJson,
  extractToolName,
  extractToolInput,
  extractFilePath,
  extractShellCommand,
  preToolDeny,
  additionalContextOutput,
  writeJson,
} from "./lib/hook-io.mjs";
import { isWriteTool, isShellTool } from "./lib/matchers.mjs";
import {
  collectRepositoriesHits,
  repositoriesDenyMessage,
} from "./checks/composer-repositories.mjs";
import {
  collectUnicodeEscapeHits,
  unicodeEscapeDenyMessage,
} from "./checks/composer-unicode-escape.mjs";
import {
  collectLockfileTargets,
  lockfileDenyMessage,
} from "./checks/composer-lockfile.mjs";
import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "./checks/protected-paths.mjs";
import {
  truncationHit,
  truncationReportMessage,
} from "./checks/test-truncation.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  const toolInput = extractToolInput(event);

  const isWrite = isWriteTool(toolName);
  const isShell = isShellTool(toolName);
  if (!isWrite && !isShell) process.exit(0);

  const filePath = extractFilePath(toolInput);

  // fail-closed guards run first; the first hit denies (single decision per hook).
  if (isWrite || isShell) {
    const repoHits = collectRepositoriesHits({ toolName, input: toolInput });
    if (repoHits.length > 0) {
      writeJson(preToolDeny(repositoriesDenyMessage(toolName, repoHits)));
      process.exit(0);
    }

    const uniHits = collectUnicodeEscapeHits({ toolName, input: toolInput });
    if (uniHits.length > 0) {
      writeJson(preToolDeny(unicodeEscapeDenyMessage(toolName, uniHits)));
      process.exit(0);
    }

    const lockTargets = collectLockfileTargets({ toolName, input: toolInput });
    if (lockTargets.length > 0) {
      writeJson(preToolDeny(lockfileDenyMessage(lockTargets)));
      process.exit(0);
    }
  }

  if (isWrite && filePath) {
    const violation = protectedPathViolation(filePath);
    if (violation) {
      writeJson(preToolDeny(protectedPathDenyMessage(filePath, violation)));
      process.exit(0);
    }
  }

  if (isShell) {
    const command = extractShellCommand(toolName, toolInput) ?? "";
    const lines = truncationHit(command);
    if (lines !== null) {
      writeJson(additionalContextOutput("PreToolUse", truncationReportMessage(lines)));
      process.exit(0);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));

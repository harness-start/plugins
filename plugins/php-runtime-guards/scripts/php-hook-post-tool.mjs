#!/usr/bin/env node
/**
 * php-runtime-guards PostToolUse entry.
 *
 * One process per edit event, dispatching to five checks:
 *   1. php -l syntax                        (php binary; report)
 *   2. composer validate                    (composer binary; report)
 *   3. encoding (BOM / non-UTF-8)           (report)
 *   4. net-new debt signals                 (report)
 *   5. net-new debug statements             (report)
 *
 * Subprocess checks (php -l, composer validate) run in parallel; the total
 * hook timeout (30s) covers the slowest check, not the sum. All reports are
 * merged into a single additionalContext output; a clean run exits 0 silently.
 *
 * On Codex non-interactive mode, patches arrive through the Bash tool as an
 * inline `*** Begin Patch` payload; patchTargetPaths extracts the targets.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  readStdinJson,
  extractToolName,
  extractToolInput,
  extractFilePath,
  extractShellCommand,
  extractCwd,
  additionalContextOutput,
  writeJson,
} from "./lib/hook-io.mjs";
import { isWriteTool, isShellTool } from "./lib/matchers.mjs";
import { patchTargetPaths } from "./lib/patch-utils.mjs";
import * as syntaxPhp from "./checks/syntax-php.mjs";
import * as syntaxComposer from "./checks/syntax-composer.mjs";
import * as encoding from "./checks/encoding.mjs";
import { collectDebtFindings, formatDebtReport } from "./checks/debt.mjs";
import { collectDebugFindings, formatDebugReport } from "./checks/debug-statement.mjs";

/**
 * Codex non-interactive mode applies file patches through the Bash tool with
 * an inline `*** Begin Patch` payload. Extract the target file paths so the
 * PostToolUse checks still run there. Returns absolute paths when resolvable.
 */

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  const toolInput = extractToolInput(event);
  const isWrite = isWriteTool(toolName);
  const isShell = isShellTool(toolName);
  if (!isWrite && !isShell) process.exit(0);

  const filePath = extractFilePath(toolInput);
  const targets = [];
  if (filePath) {
    targets.push(filePath);
  } else if (isShell) {
    const command = extractShellCommand(toolName, toolInput) ?? "";
    targets.push(...patchTargetPaths(command, extractCwd(event)));
  }

  const reports = [];

  for (const target of [...new Set(targets)]) {
    if (!existsSync(target)) continue;

    // ── Synchronous file checks (fast; bounded reads) ──
    if (encoding.matches(target)) {
      const issues = encoding.check(target);
      if (issues.length > 0) reports.push(encoding.formatReport(target, issues));
    }

    if (syntaxPhp.matches(target)) {
      const debtFindings = collectDebtFindings(toolInput, target);
      if (debtFindings.length > 0) reports.push(formatDebtReport(target, debtFindings));

      const debugSummary = collectDebugFindings(toolInput, target);
      if (debugSummary) reports.push(formatDebugReport(debugSummary));
    }
  }

  // ── Subprocess checks in parallel (first target only: lint is per-file) ──
  const primary = targets.find((target) => existsSync(target));
  if (primary) {
    const jobs = [];
    if (syntaxPhp.matches(primary)) {
      jobs.push(syntaxPhp.check(primary));
    }
    if (syntaxComposer.matches(primary)) {
      jobs.push(syntaxComposer.check(primary));
    }

    const results = await Promise.all(jobs);
    let resultIndex = 0;
    if (syntaxPhp.matches(primary) && results[resultIndex]) {
      reports.push(syntaxPhp.formatFailure(results[resultIndex], primary));
      resultIndex++;
    }
    if (syntaxComposer.matches(primary) && results[resultIndex]) {
      reports.push(syntaxComposer.formatFailure(results[resultIndex], primary));
    }
  }

  if (reports.length === 0) process.exit(0);

  writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  process.exit(0);
}

main().catch(() => process.exit(0));

#!/usr/bin/env node
/**
 * typescript-runtime-guards PostToolUse: encoding + debt (+ syntax) reports.
 */
import { existsSync } from "node:fs";
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
import * as encoding from "./checks/encoding.mjs";
import { collectDebtFindings, formatDebtReport } from "./checks/debt.mjs";
import * as syntax from "./checks/syntax.mjs";
import { eslintReport } from "./checks/runtime-context.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  const toolInput = extractToolInput(event);
  const isWrite = isWriteTool(toolName);
  const isShell = isShellTool(toolName);
  if (!isWrite && !isShell) process.exit(0);

  const targets = [];
  const filePath = extractFilePath(toolInput);
  if (filePath) targets.push(filePath);
  if (isShell) {
    const command = extractShellCommand(toolName, toolInput) ?? "";
    targets.push(...patchTargetPaths(command, extractCwd(event)));
  }

  const reports = [];
  for (const target of [...new Set(targets)]) {
    if (!existsSync(target)) continue;
    if (encoding.matches(target)) {
      const issues = encoding.check(target);
      if (issues.length > 0) reports.push(encoding.formatReport(target, issues));
    }
    const debt = collectDebtFindings(toolInput, target);
    if (debt.length > 0) reports.push(formatDebtReport(target, debt));
  }

  const primary = targets.find((t) => existsSync(t));
  if (primary && syntax.matches(primary)) {
    const result = await syntax.check(primary);
    if (result) reports.push(syntax.formatFailure(result, primary));
    const lint = await eslintReport(primary);
    if (lint) reports.push(lint);
  }

  if (reports.length === 0) process.exit(0);
  writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  process.exit(0);
}

main().catch(() => process.exit(0));

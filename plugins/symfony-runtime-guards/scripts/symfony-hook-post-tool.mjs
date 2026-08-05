#!/usr/bin/env node
/**
 * symfony-runtime-guards PostToolUse entry.
 *
 * One process per edit event, dispatching to:
 *   1. Doctrine entity mapping heuristics   (.php under an Entity path; report)
 *   2. Twig template syntax                 (.twig; report)
 *
 * Twig linting runs its subprocess chain (lint:twig → twigcs → regex) while
 * the Doctrine scan is synchronous; both results merge into one
 * additionalContext output. A clean run exits 0 silently.
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
import * as doctrineEntity from "./checks/doctrine-entity.mjs";
import * as twig from "./checks/twig.mjs";

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

    if (doctrineEntity.matches(target)) {
      const errors = doctrineEntity.check(target);
      if (errors.length > 0) reports.push(doctrineEntity.formatReport(target, errors));
    }

    if (twig.matches(target)) {
      const failure = await twig.check(target);
      if (failure) reports.push(twig.formatFailure(failure, target));
    }
  }

  if (reports.length === 0) process.exit(0);

  writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  process.exit(0);
}

main().catch(() => process.exit(0));

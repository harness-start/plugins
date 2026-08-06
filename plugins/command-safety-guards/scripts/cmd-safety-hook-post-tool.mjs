#!/usr/bin/env node

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  additionalContextOutput,
  extractCwd,
  extractToolInput,
  extractToolName,
  extractWriteTargets,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import { fileSafetyReports } from "./engines/file-safety.mjs";
import {
  loadUserConfig,
  resolveRepoRoot,
  resolveRules,
} from "./lib/rule-engine.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const { settings } = resolveRules(userConfig);
  if (settings.engines.fileSafety === false) return;

  const input = extractToolInput(event);
  const reports = extractWriteTargets(extractToolName(event), input)
    .map((path) => (isAbsolute(path) ? path : resolve(cwd, path)))
    .filter(existsSync)
    .flatMap((path) => fileSafetyReports(path, input));
  if (reports.length) {
    writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}

main().catch(() => process.exit(0));

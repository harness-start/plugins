#!/usr/bin/env node

import { existsSync } from "node:fs";
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

const event = await readStdinJson();
if (event.__parseError) process.exit(0);

const cwd = extractCwd(event);
const repoRoot = resolveRepoRoot(cwd);
const userConfig = await loadUserConfig(repoRoot);
const { settings } = resolveRules(userConfig);

if (settings.engines.fileSafety === false) process.exit(0);

const input = extractToolInput(event);
const reports = extractWriteTargets(extractToolName(event), input)
  .filter(existsSync)
  .flatMap((path) => fileSafetyReports(path, input));
if (reports.length) {
  writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
}

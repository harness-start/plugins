#!/usr/bin/env node

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  additionalContextOutput,
  extractCwd,
  extractToolInput,
  extractWriteTargets,
  readStdinJson,
  writeJson,
} from "../../lib/hook-io.js";
import { fileSafetyReports } from "../../engines/file-safety.js";
import {
  loadUserConfig,
  resolveRepoRoot,
  resolveRules,
} from "../../lib/rule-engine.js";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const { settings } = resolveRules(userConfig);
  if (settings.engines.fileSafety === false) return;

  const input = extractToolInput(event);
  const reports = extractWriteTargets(event)
    .map((path) => (isAbsolute(path) ? path : resolve(cwd, path)))
    .filter(existsSync)
    .flatMap((path) => fileSafetyReports(path, input));
  if (reports.length) {
    writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}

main().catch(() => process.exit(0));

#!/usr/bin/env node
// harness-source-hash: sha256:43c7b70ada066962018a5e669c0d465c150544f2552f0164bc66b6b6f8600cae
import {
  sessionContext
} from "../chunks/chunk-ISCIP7HC.mjs";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-6XG3DXCN.mjs";

// plugins/language-output-governance/src/entries/hooks/language-output-hook-session-start.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(extractCwd(event), warn);
  const source = extractSource(event);
  const reset = source === "startup" || source === "clear";
  const state = initializeState(event, config.defaultProfile, reset);
  writeJson(additionalContextOutput("SessionStart", sessionContext(state.preferredProfile)));
}
main().catch((error) => warn(`SessionStart failed open: ${error.message}`));

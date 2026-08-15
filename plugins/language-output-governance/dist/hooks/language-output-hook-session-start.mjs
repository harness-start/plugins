#!/usr/bin/env node
// harness-source-hash: sha256:8b22cb1b21e5f6b88eb09c24ab5257e5560707fea0b68d252123ee742a6e79af
import {
  sessionContext
} from "../chunks/chunk-2KNNLTG7.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-3ZGNNHPU.mjs";

// plugins/language-output-governance/src/entries/hooks/language-output-hook-session-start.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(eventCwd(event), warn);
  const source = extractSource(event);
  const reset = source === "startup" || source === "clear";
  const state = initializeState(event, config.defaultProfile, reset);
  writeJson(additionalContextOutput("SessionStart", sessionContext(state.preferredProfile)));
}
main().catch((error) => warn(`SessionStart failed open: ${error.message}`));

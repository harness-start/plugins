#!/usr/bin/env node
// harness-source-hash: sha256:5aa7dd7b9b2ec85ef20f453537ce1876a1c089d0805041e6d9d4d9a8d0d1c2d4
import {
  sessionContext
} from "../chunks/chunk-4SZGO5L3.mjs";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-65JJ2KCU.mjs";

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

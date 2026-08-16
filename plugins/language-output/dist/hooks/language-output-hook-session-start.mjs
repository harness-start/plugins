#!/usr/bin/env node
// harness-source-hash: sha256:6cc9a97b34754ea0a7604c0d0d1cef99bd2460f1af7451e191df7272ae6fdebf
import {
  sessionContext
} from "../chunks/chunk-FXRPRQDV.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-SBIC7H2I.mjs";

// plugins/language-output/src/entries/hooks/language-output-hook-session-start.ts
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

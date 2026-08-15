#!/usr/bin/env node
import {
  sessionContext
} from "../chunks/chunk-K6RAM7S5.mjs";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-7YW25IUP.mjs";

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

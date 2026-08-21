#!/usr/bin/env node
// harness-source-hash: sha256:db5c96b5b8f2ef82c10272136b79a1d08f9cb0afda2bc9941c859ce3e0603bbc
import {
  sessionContext
} from "../chunks/chunk-O3BD2DVX.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-5E4OVG6T.mjs";

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

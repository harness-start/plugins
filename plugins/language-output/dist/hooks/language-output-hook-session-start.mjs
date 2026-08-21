#!/usr/bin/env node
// harness-source-hash: sha256:a9c55b31dee7673152b17a71011cc167b61f5a95441f6aba22ff2f8ae2534df0
import {
  sessionContext
} from "../chunks/chunk-2OOJFDV7.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-PN3YOEDT.mjs";

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

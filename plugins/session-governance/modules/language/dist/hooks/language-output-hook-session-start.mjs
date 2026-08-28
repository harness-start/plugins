#!/usr/bin/env node
// harness-source-hash: sha256:d8c95fd90e5a64a2eb23aaee2937c38a8ce97493b87f8cd3b557fe464cdfbdf7
import {
  sessionContext
} from "../chunks/chunk-C64HASW7.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-E2AJDEOE.mjs";

// plugins/session-governance/modules/language/src/entries/hooks/language-output-hook-session-start.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(eventCwd(event), warn);
  const source = extractSource(event);
  const reset = source === "startup" || source === "clear";
  const state = initializeState(event, config.defaultProfile, reset);
  writeJson(additionalContextOutput("SessionStart", sessionContext(state.preferredProfile, config.artifactProfile)));
}
main().catch((error) => warn(`SessionStart failed open: ${error.message}`));

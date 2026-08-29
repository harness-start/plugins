#!/usr/bin/env node
// harness-source-hash: sha256:a63eb2957901c0b015da825fded911a6bab61876bf372d66f153d94db7035396
import {
  sessionContext
} from "../chunks/chunk-NXL4RBVI.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-ICU6VMKK.mjs";

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

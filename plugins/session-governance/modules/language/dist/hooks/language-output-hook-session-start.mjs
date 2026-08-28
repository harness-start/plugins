#!/usr/bin/env node
// harness-source-hash: sha256:79ac4709881682e11ae1105400c3a4411820b98c7ab471b44a0566bcc62b10a1
import {
  sessionContext
} from "../chunks/chunk-AZB2NJRT.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-XXU46M4R.mjs";

// plugins/session-governance/modules/language/src/entries/hooks/language-output-hook-session-start.ts
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

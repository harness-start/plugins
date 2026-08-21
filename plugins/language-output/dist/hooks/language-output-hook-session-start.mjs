#!/usr/bin/env node
// harness-source-hash: sha256:75a99cdb060fc16b6d5f00c02c18faa8fb73a9b59b1542244a72b9d44aae42bc
import {
  sessionContext
} from "../chunks/chunk-72RM5LVL.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-4FE42TVS.mjs";

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

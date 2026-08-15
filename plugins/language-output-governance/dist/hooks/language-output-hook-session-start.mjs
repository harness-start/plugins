#!/usr/bin/env node
// harness-source-hash: sha256:e2c899ff74b0ee05fae26bce12ed170de8626cce44835f531da3b915196b3021
import {
  sessionContext
} from "../chunks/chunk-KZ3ER46X.mjs";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-NAWYRYUG.mjs";

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

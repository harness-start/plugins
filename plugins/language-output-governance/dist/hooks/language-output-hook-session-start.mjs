#!/usr/bin/env node
// harness-source-hash: sha256:b83e188d06912c83de2fac3551a6806bff8e3da1a620013df68136dc230a8f7a
import {
  sessionContext
} from "../chunks/chunk-5GWYTS2B.mjs";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  initializeState,
  loadConfig,
  readStdinJson,
  warn,
  writeJson
} from "../chunks/chunk-KIRANYPH.mjs";

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

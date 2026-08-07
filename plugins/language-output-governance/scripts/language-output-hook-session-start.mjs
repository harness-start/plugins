#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  readStdinJson,
  warn,
  writeJson,
} from "./lib/hook-io.mjs";
import { sessionContext } from "./lib/policy.mjs";
import { initializeState } from "./lib/state-store.mjs";

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

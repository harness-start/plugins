#!/usr/bin/env node
import { loadConfig } from "../../lib/config.js";
import {
  additionalContextOutput,
  extractCwd,
  extractSource,
  readStdinJson,
  warn,
  writeJson,
} from "../../lib/hook-io.js";
import { sessionContext } from "../../lib/policy.js";
import { initializeState } from "../../lib/state-store.js";

export async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(extractCwd(event), warn);
  const source = extractSource(event);
  const reset = source === "startup" || source === "clear";
  const state = initializeState(event, config.defaultProfile, reset);
  writeJson(additionalContextOutput("SessionStart", sessionContext(state.preferredProfile, config.artifactProfile)));
}

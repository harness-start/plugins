#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import {
  extractAssistantMessage,
  extractCwd,
  isStopHookActive,
  readStdinJson,
  stopBlock,
  warn,
  writeJson,
} from "./lib/hook-io.mjs";
import { detectLanguageDrift } from "./lib/language-drift.mjs";
import { driftBlockReason } from "./lib/policy.mjs";
import { readState } from "./lib/state-store.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError || isStopHookActive(event)) return;
  const message = extractAssistantMessage(event);
  if (!message) return;
  const { config } = await loadConfig(extractCwd(event), warn);
  if (config.stop === "off") return;
  const state = readState(event, config.defaultProfile);
  const [finding] = detectLanguageDrift(message, {
    preferredProfile: state.preferredProfile,
    authorizedProfiles: state.authorizedProfiles,
    detection: config.detection,
  });
  if (!finding) return;
  writeJson(stopBlock(driftBlockReason(state.preferredProfile, finding)));
}

main().catch((error) => warn(`Stop failed open: ${error.message}`));

#!/usr/bin/env node
import { loadConfig } from "../../lib/config.js";
import {
  extractAssistantMessage,
  extractCwd,
  readStdinJson,
  stopBlock,
  warn,
  writeJson,
} from "../../lib/hook-io.js";
import { detectLanguageDrift } from "../../lib/language-drift.js";
import { driftBlockReason } from "../../lib/policy.js";
import { readState } from "../../lib/state-store.js";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
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

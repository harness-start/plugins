#!/usr/bin/env node
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-K6RAM7S5.mjs";
import {
  extractAssistantMessage,
  extractCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-7YW25IUP.mjs";

// plugins/language-output-governance/src/entries/hooks/language-output-hook-stop.ts
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
    detection: config.detection
  });
  if (!finding) return;
  writeJson(stopBlock(driftBlockReason(state.preferredProfile, finding)));
}
main().catch((error) => warn(`Stop failed open: ${error.message}`));

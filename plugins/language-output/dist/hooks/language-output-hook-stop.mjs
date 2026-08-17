#!/usr/bin/env node
// harness-source-hash: sha256:bf6b57bbb904895c1eac3c12bba69ac197f822c884ac29449a15ce3e8002a841
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-N73J2YGT.mjs";
import {
  eventAssistantMessage,
  eventCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-X56YSI3T.mjs";

// plugins/language-output/src/entries/hooks/language-output-hook-stop.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const message = eventAssistantMessage(event);
  if (!message) return;
  const { config } = await loadConfig(eventCwd(event), warn);
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

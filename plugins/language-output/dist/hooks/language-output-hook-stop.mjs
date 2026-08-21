#!/usr/bin/env node
// harness-source-hash: sha256:9bc56eb2c3ebfbeed02b7f45807ed6d4e0447edaf7d484de98395c1ccd53ca0c
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-L5FN2RBN.mjs";
import {
  eventAssistantMessage,
  eventCwd,
  isStopHookActive,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-PAJW5UZ7.mjs";

// plugins/language-output/src/entries/hooks/language-output-hook-stop.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (isStopHookActive(event)) return;
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

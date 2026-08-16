#!/usr/bin/env node
// harness-source-hash: sha256:6cc9a97b34754ea0a7604c0d0d1cef99bd2460f1af7451e191df7272ae6fdebf
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-FXRPRQDV.mjs";
import {
  eventAssistantMessage,
  eventCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-SBIC7H2I.mjs";

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

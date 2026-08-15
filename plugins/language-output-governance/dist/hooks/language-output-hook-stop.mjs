#!/usr/bin/env node
// harness-source-hash: sha256:5aa7dd7b9b2ec85ef20f453537ce1876a1c089d0805041e6d9d4d9a8d0d1c2d4
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-4SZGO5L3.mjs";
import {
  extractAssistantMessage,
  extractCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-65JJ2KCU.mjs";

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

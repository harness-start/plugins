#!/usr/bin/env node
// harness-source-hash: sha256:e2c899ff74b0ee05fae26bce12ed170de8626cce44835f531da3b915196b3021
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-KZ3ER46X.mjs";
import {
  extractAssistantMessage,
  extractCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-NAWYRYUG.mjs";

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

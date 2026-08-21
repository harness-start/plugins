#!/usr/bin/env node
// harness-source-hash: sha256:a9c55b31dee7673152b17a71011cc167b61f5a95441f6aba22ff2f8ae2534df0
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-2OOJFDV7.mjs";
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
} from "../chunks/chunk-PN3YOEDT.mjs";

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

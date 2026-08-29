#!/usr/bin/env node
// harness-source-hash: sha256:a63eb2957901c0b015da825fded911a6bab61876bf372d66f153d94db7035396
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-NXL4RBVI.mjs";
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
} from "../chunks/chunk-ICU6VMKK.mjs";

// plugins/session-governance/modules/language/src/entries/hooks/language-output-hook-stop.ts
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

#!/usr/bin/env node
// harness-source-hash: sha256:79ac4709881682e11ae1105400c3a4411820b98c7ab471b44a0566bcc62b10a1
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-AZB2NJRT.mjs";
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
} from "../chunks/chunk-XXU46M4R.mjs";

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

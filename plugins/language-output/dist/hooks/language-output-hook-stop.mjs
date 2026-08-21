#!/usr/bin/env node
// harness-source-hash: sha256:75a99cdb060fc16b6d5f00c02c18faa8fb73a9b59b1542244a72b9d44aae42bc
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-72RM5LVL.mjs";
import {
  eventAssistantMessage,
  eventCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-4FE42TVS.mjs";

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

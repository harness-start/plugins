#!/usr/bin/env node
// harness-source-hash: sha256:db5c96b5b8f2ef82c10272136b79a1d08f9cb0afda2bc9941c859ce3e0603bbc
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-O3BD2DVX.mjs";
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
} from "../chunks/chunk-5E4OVG6T.mjs";

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

#!/usr/bin/env node
// harness-source-hash: sha256:43c7b70ada066962018a5e669c0d465c150544f2552f0164bc66b6b6f8600cae
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-ISCIP7HC.mjs";
import {
  extractAssistantMessage,
  extractCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-6XG3DXCN.mjs";

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

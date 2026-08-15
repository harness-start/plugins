#!/usr/bin/env node
// harness-source-hash: sha256:b83e188d06912c83de2fac3551a6806bff8e3da1a620013df68136dc230a8f7a
import {
  detectLanguageDrift,
  driftBlockReason
} from "../chunks/chunk-5GWYTS2B.mjs";
import {
  extractAssistantMessage,
  extractCwd,
  loadConfig,
  readState,
  readStdinJson,
  stopBlock,
  warn,
  writeJson
} from "../chunks/chunk-KIRANYPH.mjs";

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

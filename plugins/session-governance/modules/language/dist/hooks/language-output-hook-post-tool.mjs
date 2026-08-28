#!/usr/bin/env node
// harness-source-hash: sha256:d8c95fd90e5a64a2eb23aaee2937c38a8ce97493b87f8cd3b557fe464cdfbdf7
import {
  detectLanguageDrift,
  toolFeedback
} from "../chunks/chunk-C64HASW7.mjs";
import {
  claimToolFeedback,
  eventCwd,
  extractFileTargets,
  generatedToolText,
  loadConfig,
  postToolFeedbackOutput,
  readState,
  readStdinJson,
  supportsPostToolFeedback,
  warn,
  writeJson
} from "../chunks/chunk-E2AJDEOE.mjs";

// plugins/session-governance/modules/language/src/entries/hooks/language-output-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(eventCwd(event), warn);
  if (config.toolFeedback === "off") return;
  if (!supportsPostToolFeedback()) return;
  const text = generatedToolText(event);
  if (!text) return;
  const state = readState(event, config.defaultProfile);
  const artifactProfile = config.artifactProfile ?? state.preferredProfile;
  const [finding] = detectLanguageDrift(text, {
    preferredProfile: artifactProfile,
    authorizedProfiles: state.authorizedProfiles,
    detection: config.detection
  });
  if (!finding || !claimToolFeedback(event, config.defaultProfile)) return;
  writeJson(postToolFeedbackOutput(
    toolFeedback(artifactProfile, finding, extractFileTargets(event))
  ));
}
main().catch((error) => warn(`PostToolUse failed open: ${error.message}`));

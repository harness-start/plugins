#!/usr/bin/env node
// harness-source-hash: sha256:a9c55b31dee7673152b17a71011cc167b61f5a95441f6aba22ff2f8ae2534df0
import {
  detectLanguageDrift,
  toolFeedback
} from "../chunks/chunk-2OOJFDV7.mjs";
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
} from "../chunks/chunk-PN3YOEDT.mjs";

// plugins/language-output/src/entries/hooks/language-output-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(eventCwd(event), warn);
  if (config.toolFeedback === "off") return;
  if (!supportsPostToolFeedback()) return;
  const text = generatedToolText(event);
  if (!text) return;
  const state = readState(event, config.defaultProfile);
  const [finding] = detectLanguageDrift(text, {
    preferredProfile: state.preferredProfile,
    authorizedProfiles: state.authorizedProfiles,
    detection: config.detection
  });
  if (!finding || !claimToolFeedback(event, config.defaultProfile)) return;
  writeJson(postToolFeedbackOutput(
    toolFeedback(state.preferredProfile, finding, extractFileTargets(event))
  ));
}
main().catch((error) => warn(`PostToolUse failed open: ${error.message}`));

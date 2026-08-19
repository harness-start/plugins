#!/usr/bin/env node
// harness-source-hash: sha256:345727962cf4c85afa0499541b6da631359185ffead00d3bb312ef81df7ffe38
import {
  detectLanguageDrift,
  toolFeedback
} from "../chunks/chunk-VGZVEYHM.mjs";
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
} from "../chunks/chunk-7I6CECTA.mjs";

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

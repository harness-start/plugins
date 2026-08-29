#!/usr/bin/env node
// harness-source-hash: sha256:a63eb2957901c0b015da825fded911a6bab61876bf372d66f153d94db7035396
import {
  detectLanguageDrift,
  toolFeedback
} from "../chunks/chunk-NXL4RBVI.mjs";
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
} from "../chunks/chunk-ICU6VMKK.mjs";

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

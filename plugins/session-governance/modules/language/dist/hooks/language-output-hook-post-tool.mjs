#!/usr/bin/env node
// harness-source-hash: sha256:79ac4709881682e11ae1105400c3a4411820b98c7ab471b44a0566bcc62b10a1
import {
  detectLanguageDrift,
  toolFeedback
} from "../chunks/chunk-AZB2NJRT.mjs";
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
} from "../chunks/chunk-XXU46M4R.mjs";

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

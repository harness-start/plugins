#!/usr/bin/env node
// harness-source-hash: sha256:b83e188d06912c83de2fac3551a6806bff8e3da1a620013df68136dc230a8f7a
import {
  detectLanguageDrift,
  toolFeedback
} from "../chunks/chunk-5GWYTS2B.mjs";
import {
  claimToolFeedback,
  extractCwd,
  extractFileTargets,
  generatedToolText,
  loadConfig,
  postToolFeedbackOutput,
  readState,
  readStdinJson,
  supportsPostToolFeedback,
  warn,
  writeJson
} from "../chunks/chunk-KIRANYPH.mjs";

// plugins/language-output-governance/src/entries/hooks/language-output-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(extractCwd(event), warn);
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

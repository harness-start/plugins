#!/usr/bin/env node
import { loadConfig } from "../../lib/config.js";
import {
  extractCwd,
  extractFileTargets,
  generatedToolText,
  postToolFeedbackOutput,
  readStdinJson,
  supportsPostToolFeedback,
  warn,
  writeJson,
} from "../../lib/hook-io.js";
import { detectLanguageDrift } from "../../lib/language-drift.js";
import { toolFeedback } from "../../lib/policy.js";
import { claimToolFeedback, readState } from "../../lib/state-store.js";

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
    detection: config.detection,
  });
  if (!finding || !claimToolFeedback(event, config.defaultProfile)) return;
  writeJson(postToolFeedbackOutput(
    toolFeedback(state.preferredProfile, finding, extractFileTargets(event)),
  ));
}

main().catch((error) => warn(`PostToolUse failed open: ${error.message}`));

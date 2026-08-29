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

export async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(extractCwd(event), warn);
  if (config.toolFeedback === "off") return;
  if (!supportsPostToolFeedback()) return;
  const text = generatedToolText(event);
  if (!text) return;
  const state = readState(event, config.defaultProfile);
  const artifactProfile = config.artifactProfile ?? state.preferredProfile;
  const [finding] = detectLanguageDrift(text, {
    preferredProfile: artifactProfile,
    authorizedProfiles: state.authorizedProfiles,
    detection: config.detection,
  });
  if (!finding || !claimToolFeedback(event, config.defaultProfile)) return;
  writeJson(postToolFeedbackOutput(
    toolFeedback(artifactProfile, finding, extractFileTargets(event)),
  ));
}

#!/usr/bin/env node
import { loadConfig } from "../../lib/config.js";
import {
  extractCwd,
  extractPrompt,
  readStdinJson,
  warn,
} from "../../lib/hook-io.js";
import { classifyLanguageIntent } from "../../lib/intent.js";
import { recordLanguageIntent } from "../../lib/state-store.js";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const intent = classifyLanguageIntent(extractPrompt(event));
  if (!intent.preferredProfile && intent.authorizedProfiles.length === 0) return;
  const { config } = await loadConfig(extractCwd(event), warn);
  recordLanguageIntent(event, config.defaultProfile, intent);
}

main().catch((error) => warn(`UserPromptSubmit failed open: ${error.message}`));

#!/usr/bin/env node
import {
  extractAssistantMessage,
  isStopHookActive,
  readStdinJson,
  stopBlock,
  writeJson,
} from "./lib/hook-io.mjs";
import { detectLanguageDrift } from "./lib/language-drift.mjs";
import { driftBlockReason } from "./lib/policy.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError || isStopHookActive(event)) return;

  const message = extractAssistantMessage(event);
  if (!message) return;

  const [finding] = detectLanguageDrift(message);
  if (!finding) return;

  writeJson(stopBlock(driftBlockReason(finding)));
}

main().catch(() => {});

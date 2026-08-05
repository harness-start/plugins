#!/usr/bin/env node
/**
 * laravel-runtime-guards UserPromptSubmit entry.
 *
 * Injects laravel environment facts once per session when the prompt signals
 * a laravel project. Fail-open: any error exits 0 silently.
 */

import {
  readStdinJson,
  extractCwd,
  extractSessionId,
  extractPrompt,
  additionalContextOutput,
  writeJson,
} from "./lib/hook-io.mjs";
import { readState, writeState } from "./lib/state-store.mjs";
import {
  HOOK_ID,
  COOLDOWN_MS,
  shouldInject,
  detectFacts,
} from "./lib/detect.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const prompt = extractPrompt(event);
  if (!shouldInject(prompt)) process.exit(0);

  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);

  const state = readState(HOOK_ID, sessionId, cwd);
  if (state && Date.now() - state.ts < COOLDOWN_MS) process.exit(0);

  const facts = detectFacts(cwd);
  if (facts === null) process.exit(0);

  writeState(HOOK_ID, sessionId, cwd, Date.now());
  writeJson(additionalContextOutput("UserPromptSubmit", facts));
  process.exit(0);
}

main().catch(() => process.exit(0));

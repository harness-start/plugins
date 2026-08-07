#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  additionalContextOutput,
  extractPrompt,
  isSubagentEvent,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  isRouteEligiblePrompt,
  promptReminder,
  sessionContext,
} from "./lib/policy.mjs";

function warn(message) {
  process.stderr.write(`[skill-routing-transparency] ${message}\n`);
}

export async function main(mode = process.argv[2], platform = process.argv[3]) {
  const event = await readStdinJson();
  if (event.__parseError || isSubagentEvent(event)) return;

  if (mode === "session") {
    writeJson(additionalContextOutput("SessionStart", sessionContext(platform)));
    return;
  }

  if (mode === "prompt" && isRouteEligiblePrompt(extractPrompt(event))) {
    writeJson(additionalContextOutput("UserPromptSubmit", promptReminder(platform)));
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}

#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { HookEvent } from "@harness/core/hook-event";

import {
  additionalContextOutput,
  readStdinJson,
  writeJson,
} from "../../lib/hook-io.js";
import { claimFirstPrompt } from "../../lib/first-prompt-state.js";

function warn(message: string) {
  process.stderr.write(`[intent-discovery] ${message}\n`);
}

export function firstTurnContext() {
  return [
    "[intent-discovery:first-turn]",
    "First classify whether discovery can change the work. If the request already states a concrete target, outcome, constraints, and acceptance, treat it as light: do not load the Skill or spawn discovery workers; inspect the named seam and continue directly.",
    "Load and follow the bundled `intent-discovery` Skill only when unresolved interpretations would materially change the deliverable or implementation.",
    "Front-load repository and source facts, use bounded parallel subagents only when their independent evidence can change the approach, and reconcile their result cards in the parent agent.",
    "Do not stop to ask the user for clarification or approval as part of this discovery pass. Choose a bounded, reversible assumption when needed, state material assumptions briefly, and continue with the request.",
  ].join("\n");
}

export function runPrompt(event: HookEvent, env: NodeJS.ProcessEnv = process.env) {
  const claim = claimFirstPrompt(event, env);
  if (!claim.claimed) return;
  if (!claim.persisted && claim.reason) warn(claim.reason);
  writeJson(additionalContextOutput("UserPromptSubmit", firstTurnContext()));
}

async function main() {
  const mode = process.argv[2] ?? "prompt";
  if (!new Set(["prompt", "user-prompt", "UserPromptSubmit"]).has(mode)) return;

  const event = await readStdinJson();
  if (event.__parseError) return;
  runPrompt(event);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

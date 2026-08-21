#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eventPrompt, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";

function warn(message: string): void {
  process.stderr.write(`[engineering-practice] ${message}\n`);
}

export function engineeringPracticeContext(): string {
  return [
    "[Engineering Practice] Optional engineering method guidance",
    "Skills are optional method guides, not Hook prerequisites or completion evidence.",
    "For non-trivial implementation or refactoring, use the bundled `engineering-judgment` method when it helps control scope and trade-offs.",
    "For read-only review, the bundled `engineering-review` method requires P0-P3 severity, exact file:line, concrete evidence, and a verifiable fix or recovery path.",
    "Completion, fixed, or passing claims need fresh command evidence; the bundled `engineering-verification` method can help select checks.",
    "Use local public seams, callers, tests, documentation, and project conventions as evidence. Hook injection or Skill loading does not prove an outcome.",
  ].join("\n");
}

const REVIEW_PROMPT = /\b(?:audit|code review|review|assess|inspect)\b/iu;
const VERIFICATION_PROMPT = /\b(?:verify|verification|validate|test|typecheck|lint|build|before (?:claiming|completion)|ready to (?:finish|ship))\b/iu;
const IMPLEMENTATION_PROMPT = /\b(?:add|change|fix|implement|migrate|modify|refactor|repair|update)\b/iu;

export function promptMethodContext(event: HookEvent): string {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  if (REVIEW_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be a read-only review. Use the bundled `engineering-review` method if useful; keep the review read-only and anchor every verified finding to severity, file:line, evidence, and recovery.";
  }
  if (VERIFICATION_PROMPT.test(prompt)) {
    return "[Engineering Practice] This task asks for verification. Use the bundled `engineering-verification` method if useful; run directly relevant checks after the last mutation and report missing or stale evidence as unverified.";
  }
  if (IMPLEMENTATION_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be implementation or refactoring. Use the bundled `engineering-judgment` method if useful; preserve the requested public contract, keep the change scoped, and verify observable behavior.";
  }
  return "";
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}

export async function runUserPromptSubmit(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; prompt guidance was skipped");
  const context = promptMethodContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === "user-prompt" ? runUserPromptSubmit : runSessionStart;
  run().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

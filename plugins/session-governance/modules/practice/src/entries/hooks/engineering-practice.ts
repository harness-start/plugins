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
    "For a high-risk implementation checkpoint, the bundled `engineering-review-checkpoint` method coordinates one bounded read-only reviewer and requires the parent to verify every returned finding.",
    "Completion, fixed, or passing claims need fresh command evidence; the bundled `engineering-verification` method can help select checks.",
    "Use local public seams, callers, tests, documentation, and project conventions as evidence. Hook injection or Skill loading does not prove an outcome.",
  ].join("\n");
}

const REVIEW_PROMPT = /\b(?:audit|code review|review|assess|inspect)\b/iu;
const VERIFICATION_PROMPT = /\b(?:verify|verification|validate|test|typecheck|lint|build|before (?:claiming|completion)|ready to (?:finish|ship))\b/iu;
const IMPLEMENTATION_PROMPT = /\b(?:add|change|fix|implement|migrate|modify|refactor|repair|update)\b/iu;
const CHECKPOINT_PROMPT = /\b(?:engineering review checkpoint|review checkpoint|checkpoint review)\b|请神/iu;
const HIGH_RISK_PROMPT = /\b(?:auth(?:entication|orization)?|security|public api|schema|migrat\w*|database|persistence|concurren\w*|race condition|data integrity|deploy\w*|release|runtime state|recovery|rollback|observability|cross-module|multi-module)\b|认证|授权|安全|公共\s*api|跨模块|数据库|持久化|迁移|并发|数据完整性|部署|发布|运行态|恢复|回滚|可观测/iu;

export function promptMethodContext(event: HookEvent): string {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  if (IMPLEMENTATION_PROMPT.test(prompt) && HIGH_RISK_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be a high-risk implementation. Use the bundled `engineering-judgment` method, then use `engineering-review-checkpoint` after the first coherent implementation slice and focused checks to dispatch one read-only reviewer before final verification.";
  }
  if (CHECKPOINT_PROMPT.test(prompt)) {
    return "[Engineering Practice] This is an explicit review checkpoint request. Use the bundled `engineering-review-checkpoint` method to dispatch one bounded read-only reviewer, then reopen and verify every returned finding before acting.";
  }
  if (REVIEW_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be a read-only review. Use the bundled `engineering-review` method if useful; keep the review read-only and anchor every verified finding to severity, a single file:line (not a line range), evidence, and recovery.";
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

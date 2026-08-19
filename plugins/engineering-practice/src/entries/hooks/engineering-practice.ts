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
    "For non-trivial implementation or refactoring, `engineering-judgment` can help control scope and tradeoffs.",
    "For a non-trivial fix, derive a compact observable contract before selecting code: value, type, container, shape, cardinality, order, stability, warning, error, and public API compatibility for existing accepted calls where applicable.",
    "A single example passing is not complete evidence. Challenge the proposed change with local callers, tests, documentation, and history, then prefer the smallest compatible repository-native mechanism.",
    "For a boundary fix, locate the first lossy transform (such as broadcast, flatten, coerce, or deduplicate) and test mixed combinations such as one empty component with another populated. Branch before lost distinctions when the contract requires them; otherwise reuse normalization, and keep the shared return path instead of synthesized branch-local outputs.",
    "When a requirement extends arity or composition, extend the named seam while old call forms remain valid; add or extend tests for zero, one, two, and many inputs through one mechanism instead of a private parallel path. Compatibility means proven accepted call forms and documented results, not preserving incidental internal or container behavior with an unproven fast path.",
    "For ordering or dependency changes, search the repository and standard library for an existing stable primitive before writing an algorithm. Before completion, add a direct durable tie-break test with two completely disjoint chains containing at least two items each; also test duplicate items, cycle fallback, and exact diagnostic behavior.",
    "Use local evidence; do not hunt for hidden evaluator artifacts or solution patches. Treat unavailable evidence as unavailable.",
    "`engineering-review` is optional guidance; every read-only review finding still needs a P0-P3 severity, exact file:line, concrete evidence, and a verifiable fix or recovery path.",
    "Completion, fixed, passing, commit, or PR claims need fresh command evidence; `engineering-verification` can help select the checks.",
    "Use only helpful methods, or work directly. Hooks remain independent enforcement.",
  ].join("\n");
}

const BOUNDARY_PROMPT = /\b(?:array|tensor|dimension|shape|broadcast|flatten|coerc|normaliz|empty|zero[- ]?(?:length|size)|boundary)\w*/iu;
const ORDERING_PROMPT = /\b(?:order|ordering|depend|preced|topolog|cycle|merge|before|after|stable)\w*/iu;

export function boundaryChallengeContext(): string {
  return [
    "[Engineering Practice: boundary challenge]",
    "Treat the requested behavior as the contract candidate: a current exception or rejection is not compatibility proof unless local docs or callers require it.",
    "Before editing, write outcomes for all-empty, mixed empty/populated, and ordinary populated inputs. Locate the first lossy transform and branch before it when the required distinction would otherwise disappear; then rejoin the shared result path.",
    "Add a durable mixed-case test that asserts the requested value and shape. Do not merely lock in the current exception.",
  ].join("\n");
}

export function orderingChallengeContext(): string {
  return [
    "[Engineering Practice: stable-order challenge]",
    "Before writing an ordering algorithm, search the repository and language standard library for an existing stable primitive and use it unless the observable contract disproves it.",
    "Extend the named public seam rather than a parallel helper, and preserve zero, one, two, and many-input calls through that same mechanism.",
    "Add a durable tie-break test with two independent chains of at least two items each. Verify stable ready-frontier behavior rather than only the motivating chain or flattened first appearance.",
    "Also verify duplicates, a genuine cycle fallback, and the exact diagnostic type and text.",
  ].join("\n");
}

export function promptChallengeContext(event: HookEvent): string {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  const contexts: string[] = [];
  if (BOUNDARY_PROMPT.test(prompt)) contexts.push(boundaryChallengeContext());
  if (ORDERING_PROMPT.test(prompt)) contexts.push(orderingChallengeContext());
  return contexts.join("\n");
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}

export async function runUserPromptSubmit(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; prompt guidance was skipped");
  const context = promptChallengeContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "session-start";
  const run = mode === "user-prompt" ? runUserPromptSubmit : runSessionStart;
  run().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

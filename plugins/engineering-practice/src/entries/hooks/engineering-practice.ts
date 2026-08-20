#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eventCwd, eventPrompt, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, stopBlock, writeJson } from "@harness/core/hook-output";
import {
  boundaryGuardFinding,
  mixedBoundarySynthesisFinding,
  mixedBoundaryRejectionFinding,
  orderingPrimitiveFinding,
  parallelCompositionSeamFinding,
  variadicDiagnosticFinding,
  variadicSeamBypassFinding,
} from "../../lib/outcome-challenge.js";

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
    "Compatibility means preserving proven accepted call forms and documented results, not incidental internal or container behavior without evidence.",
    "Use local evidence; do not hunt for hidden evaluator artifacts or solution patches. Treat unavailable evidence as unavailable.",
    "`engineering-review` is optional guidance; every read-only review finding still needs a P0-P3 severity, exact file:line, concrete evidence, and a verifiable fix or recovery path.",
    "Completion, fixed, passing, commit, or PR claims need fresh command evidence; `engineering-verification` can help select the checks.",
    "Use only helpful methods, or work directly. Hooks remain independent enforcement.",
  ].join("\n");
}

const BOUNDARY_PROMPT = /\b(?:array|tensor|dimension|shape|broadcast|flatten|coerc|normaliz|empty|zero[- ]?(?:length|size)|boundary)\w*/iu;
const ORDERING_PROMPT = /\b(?:order(?:ed|ing)?|depend(?:ency|encies|ent|s)?|preced\w*|topolog\w*|cycle\w*|merge\w*|stable\w*)\b/iu;
const DIAGNOSTIC_DISPUTE_PROMPT = /(?:(?:warning|diagnostic|error\s+message)[\s\S]{0,120}\b(?:wrong|incorrect|misleading|unhelpful|arbitrary)\b|\b(?:wrong|incorrect|misleading|unhelpful|arbitrary)\b[\s\S]{0,120}(?:warning|diagnostic|message))/iu;

export function boundaryChallengeContext(): string {
  return [
    "[Engineering Practice: boundary challenge]",
    "Treat the requested behavior as the contract candidate: a current exception or rejection is not compatibility proof unless local docs or callers require it.",
    "Before editing, write outcomes for all-empty, mixed empty/populated, and ordinary populated inputs. The mixed case must use unequal cardinality, such as zero items beside a singleton, so broadcast/coercion cannot hide which component still carries data.",
    "Locate the first lossy transform and branch before it when the required distinction would otherwise disappear; then rejoin the shared result path.",
    "For mixed unequal-cardinality inputs, do not synthesize one shared empty aggregate or matrix and split it back into components; preserve each original caller component separately.",
    "Add a durable mixed-case test that asserts each output component equals its corresponding input in both value and shape. Do not merely assert shapes or lock in the current exception.",
  ].join("\n");
}

export function orderingChallengeContext(diagnosticDisputed = false): string {
  const context = [
    "[Engineering Practice: stable-order challenge]",
    "Before writing an ordering algorithm, run a repository-wide search for stable/topological/dependency ordering primitives and check the language standard library. Use an existing primitive unless the observable contract disproves it.",
    "Extend the named public seam rather than a parallel helper, and preserve zero, one, two, and many-input calls through that same normalization mechanism. Do not add a raw single-input passthrough that skips deduplication or changes the result container unless local evidence explicitly requires it.",
    "Add a durable tie-break test with two independent chains of at least two items each. Stable ready-frontier means [a1→a2] and [b1→b2] with discovery order [a1,a2,b1,b2] yields [a1,b1,a2,b2], not [a1,a2,b1,b2].",
    "Test an adjacent duplicate in the same chain: it must not create a self-dependency or cycle. Also verify a genuine cycle fallback and the exact diagnostic type and text.",
  ];
  if (diagnosticDisputed) {
    context.push("The request disputes the diagnostic content. Report the original caller-supplied constraint groups—the complete original input sequences—as the caller-visible conflicting operands, not a pair of elements extracted from them or arbitrary internal cycle nodes. Render the complete operands as one grammatical summary using project-conventional delimiters; do not retain an internal-node-oriented one-item-per-line layout unless local tests or documentation require it. Assert the exact diagnostic type and text against those original sequences.");
  }
  return context.join("\n");
}

export function promptChallengeContext(event: HookEvent): string {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  const contexts: string[] = [];
  if (BOUNDARY_PROMPT.test(prompt)) contexts.push(boundaryChallengeContext());
  if (ORDERING_PROMPT.test(prompt)) contexts.push(orderingChallengeContext(DIAGNOSTIC_DISPUTE_PROMPT.test(prompt)));
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

function gitOutput(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

export async function runStop(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; outcome challenge was skipped");
  const cwd = eventCwd(event);
  const root = gitOutput(cwd, ["rev-parse", "--show-toplevel"]).trim();
  if (!root) return;
  const diff = gitOutput(root, ["diff", "--no-ext-diff", "--unified=80", "HEAD", "--"]);
  if (!diff) return;

  const mixedRejection = mixedBoundaryRejectionFinding(diff);
  if (mixedRejection) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${mixedRejection.path}:${mixedRejection.line}: the change invents a mixed empty/populated rejection before lossy transform ${mixedRejection.transform}(). A new exception is not preservation evidence. Add a public-seam unequal-cardinality test that asserts every corresponding component's value and shape, then preserve that observable result; or cite local caller/documentation evidence that explicitly requires rejection.`,
    ));
    return;
  }

  const mixedSynthesis = mixedBoundarySynthesisFinding(diff);
  if (mixedSynthesis) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${mixedSynthesis.path}:${mixedSynthesis.line}: shared empty aggregate ${mixedSynthesis.aggregate} is synthesized when any caller component is empty, then split back into components. This erases caller components that still carry data. Preserve each corresponding input's value and shape before the lossy transform, and prove the mixed unequal-cardinality result at the public seam.`,
    ));
    return;
  }

  const boundary = boundaryGuardFinding(diff);
  if (boundary) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${boundary.path}:${boundary.line}: the new empty-input guard is after lossy transform ${boundary.transform}(). Move the contract decision before that transform, and add a mixed unequal-cardinality test asserting each component's value and shape; or remove the short-circuit if local evidence disproves preservation.`,
    ));
    return;
  }

  const variadicBypass = variadicSeamBypassFinding(diff);
  if (variadicBypass) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${variadicBypass.path}:${variadicBypass.line}: the new variadic seam returns ${variadicBypass.parameter}[0] unchanged for one input, bypassing the shared normalization contract. Route zero, one, two, and many inputs through the same deduplication/container mechanism, or cite local public-contract evidence that explicitly requires raw passthrough.`,
    ));
    return;
  }

  const parallelSeam = parallelCompositionSeamFinding(diff);
  if (parallelSeam) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${parallelSeam.path}:${parallelSeam.line}: private multi-input helper ${parallelSeam.helper} was added beside fixed-arity named public seam ${parallelSeam.publicSeam}. Extend the named seam itself and route zero, one, two, and many inputs through it; do not leave accepted callers on a narrower parallel contract.`,
    ));
    return;
  }

  const variadicDiagnostic = variadicDiagnosticFinding(diff);
  if (variadicDiagnostic) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${variadicDiagnostic.path}:${variadicDiagnostic.line}: the new variadic composition diagnostic formats extracted variable ${variadicDiagnostic.variable} instead of the complete caller-supplied input sequences. Keep the original groups through cycle handling and assert the exact warning/error text renders those full operands, not selected internal elements.`,
    ));
    return;
  }

  const candidates = gitOutput(root, [
    "grep",
    "-n",
    "-I",
    "-E",
    "stable_?(topological|dependency|order)|topological_?(sort|order)|stable(Topological|Dependency|Order)",
    "--",
  ]).split("\n").filter(Boolean);
  const ordering = orderingPrimitiveFinding(diff, candidates);
  if (ordering) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked: ${ordering.path} adds a hand-rolled dependency ordering loop while repository primitive ${ordering.candidate} exists. Reuse that primitive through the named seam, or add a public-seam counterexample proving it cannot satisfy the required ready-frontier, duplicate, cycle, and diagnostic contracts.`,
    ));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "session-start";
  const run = mode === "user-prompt" ? runUserPromptSubmit : mode === "stop" ? runStop : runSessionStart;
  run().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

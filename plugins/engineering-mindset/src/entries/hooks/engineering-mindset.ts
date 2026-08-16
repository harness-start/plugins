#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readStdinJson } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";

function warn(message: string): void {
  process.stderr.write(`[engineering-mindset] ${message}\n`);
}

export function engineeringMindsetContext(): string {
  const hostLoadingRule = process.env.HARNESS_HOST === "codex"
    ? "Codex loading rule: before the first matching engineering action, read `$HOME/.agents/skills/<name>/SKILL.md` for community Skills and the discovered plugin path for bundled Skills. Codex completion gate: after the last change and before the final response, read `$HOME/.agents/skills/verification-before-completion/SKILL.md`, then verify."
    : "Claude loading rule: use the native Skill tool for every selected Skill before the first matching engineering or writing action.";

  return [
    "[Engineering Mindset] Selective Skill routing",
    "Mandatory pre-action gate: before any matching action or answer, load every Skill in its route via host-native Skill invocation or its resolved SKILL.md; memory is not a load.",
    hostLoadingRule,
    "Load only the smallest relevant set; never load unrelated Skills.",
    "For non-trivial implementation, review, or refactoring, load `karpathy-guidelines`; keep changes surgical and success verifiable.",
    "For a bug, test/build failure, regression, or unexpected behavior, load `systematic-debugging` before a fix; add `karpathy-guidelines` to implement it.",
    "Before any completion, fixed, passing, commit, or PR claim, load `verification-before-completion` and run fresh relevant verification.",
    "Load `caveman` only when the user explicitly asks for terse output, fewer tokens, or caveman mode; preserve safety and exact technical content.",
    "For an English prose deliverable, load both `humanizer` and `stop-slop`: use stop-slop to find candidates and humanizer to decide contextual edits and false positives.",
    "For a Chinese prose deliverable, load `humanizer-zh`, `shuorenhua`, and `ai-flavor-remover`; shuorenhua's scene, fidelity, and protected-span rules resolve conflicts.",
    "For substantial mixed-language prose, load both language stacks; isolated foreign terms follow the main language.",
    "For human-readable Markdown prose, also load `remove-ai-style` and use its analyzer before/after edits, or after a new first draft and revision. Hits are evidence, not replacements.",
    "Exclude code, commands, config, machine-readable output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure.",
    "User, project, safety, and platform rules take precedence. Never claim a missing Skill, reference, Python 3, or analyzer loaded or ran; report the gap and use available rules.",
  ].join("\n");
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) {
    warn("invalid hook input; advisory context was skipped");
    return;
  }
  writeJson(additionalContext("SessionStart", engineeringMindsetContext()));
}

async function main(): Promise<void> {
  await runSessionStart();
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

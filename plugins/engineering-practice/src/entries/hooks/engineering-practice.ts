#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdinJson } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";

function warn(message: string): void {
  process.stderr.write(`[engineering-practice] ${message}\n`);
}

export function engineeringPracticeContext(): string {
  const loading = process.env.HARNESS_HOST === "codex"
    ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before acting."
    : "Claude: invoke each selected plugin Skill through the native Skill tool before acting.";
  return [
    "[Engineering Practice] Selective engineering Skill orchestration",
    loading,
    "For non-trivial implementation, review, or refactoring, require `engineering-judgment`.",
    "For bugs, failures, regressions, or unexpected behavior, require `engineering-debugging` before proposing a fix.",
    "Before a completion, fixed, passing, commit, or PR claim, require `engineering-verification` and fresh command evidence.",
    "Load only Skills selected by the current engineering task. Hooks remain independent enforcement and are not completion evidence.",
  ].join("\n");
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSessionStart().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

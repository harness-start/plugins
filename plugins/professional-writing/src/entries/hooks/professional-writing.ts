#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdinJson } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";

function warn(message: string): void {
  process.stderr.write(`[professional-writing] ${message}\n`);
}

export function professionalWritingContext(): string {
  const loading = process.env.HARNESS_HOST === "codex"
    ? "Codex: read each selected community Skill at `$HOME/.agents/skills/<name>/SKILL.md` and the bundled `ai-flavor-remover` Skill before editing prose."
    : "Claude: invoke each selected Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
    "Use `caveman` only for an explicit terse-output request.",
    "For English prose, require `humanizer` and `stop-slop`.",
    "For Chinese prose, require `humanizer-zh`, `shuorenhua`, and bundled `ai-flavor-remover`.",
    "For human-readable Markdown prose, also require `remove-ai-style`. Before every analyzer run, SHA-256 `scripts/analyze_ai_style.py` and require `b1f0fa7af66072f23723f52fde09db05f0d3a3bcdaeab8194a14cf2cbce04bf7`; never execute a mismatched file.",
    "For substantial mixed-language prose, use both language routes; isolated foreign terms follow the main language.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure.",
    "If any Skill required by the selected route is absent or unreadable, stop the route and report the dependency gap. Do not imitate it from memory.",
  ].join("\n");
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", professionalWritingContext()));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSessionStart().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

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
    ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before editing prose."
    : "Claude: invoke each selected plugin Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
    "Whenever the response requires the user to carry out a procedure, troubleshoot, choose among options, recover from an error, or continue unfinished work, you MUST load `actionable-response` before answering. This is the default for action-heavy responses; do not wait for the user to request concise or ADHD-friendly wording. Never diagnose or label the user.",
    "For a knowledge-only answer or fully completed task, give the answer or result directly and do not manufacture a next action.",
    "Load `visual-explanation` when the user asks to see the topic visually, or when relationships, sequence, hierarchy, or state changes become materially clearer in the smallest useful visual. Do not force a visual onto a simple question.",
    "Use `writing-terse-output` only for an explicit terse-output request.",
    "For English prose, require `writing-english-prose`.",
    "For Chinese prose, require `writing-chinese-prose` and bundled `ai-flavor-remover`.",
    "For human-readable Markdown prose, also require `writing-markdown-ai-style`. Locate signals with `node <plugin>/dist/cli/analyze-ai-style.mjs <file>`; the report is evidence, not an automatic rewrite.",
    "For substantial mixed-language prose, use both language routes; isolated foreign terms follow the main language.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure.",
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

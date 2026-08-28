#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eventCwd, eventPrompt, eventToolResponse, isRecord, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { analyzeAiStyle, type AnalyzerFinding } from "../../analyze-ai-style.ts";

const MAX_MARKDOWN_BYTES = 256 * 1024;
const MAX_MARKDOWN_FILES = 8;
const MAX_REPORTED_FINDINGS = 20;
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const IGNORED_PATH = /(?:^|[\\/])(?:\.acceptance-runs|\.git|\.tmp|build|coverage|dist|node_modules|vendor)(?:[\\/]|$)/u;

type LocatedFinding = AnalyzerFinding & { path: string };
type SkippedTarget = { path: string; reason: string };

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
    "Select language-specific editing Skills only for an explicit prose rewrite, polishing, naturalness, or de-AI request. Ordinary technical, factual, and conversational responses do not load them.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure.",
  ].join("\n");
}

const EDITING_REQUEST = /\b(?:de-?ai|edit|humanize|natural(?:ness)?|polish|rewrite|writing style)\b|去\s*AI\s*味|改写|改成|润色|自然(?:一点|些|的)?|写得更/iu;
const DE_AI_REQUEST = /\b(?:de-?ai|humanize)\b|去\s*AI\s*味|去机器味|去模板味|AI\s*味/iu;
const MARKDOWN_REQUEST = /\bmarkdown\b|\.(?:md|markdown)\b/iu;
const CHINESE_TEXT = /\p{Script=Han}/u;
const ENGLISH_TEXT = /[A-Za-z]{3}/u;

export function writingPromptContext(event: HookEvent): string {
  const prompt = eventPrompt(event);
  if (!prompt || !EDITING_REQUEST.test(prompt)) return "";
  const methods: string[] = [];
  if (CHINESE_TEXT.test(prompt)) methods.push("`writing-chinese-prose`");
  if (CHINESE_TEXT.test(prompt) && DE_AI_REQUEST.test(prompt)) methods.push("`ai-flavor-remover`");
  if (ENGLISH_TEXT.test(prompt)) methods.push("`writing-english-prose`");
  if (MARKDOWN_REQUEST.test(prompt)) methods.push("`writing-markdown-ai-style`");
  if (!methods.length) return "";
  return [
    "[Professional Writing] Explicit prose-editing route",
    `Load each listed bundled method before editing: ${[...new Set(methods)].join(", ")}.`,
    ...(MARKDOWN_REQUEST.test(prompt)
      ? ["Run the public analyzer as `node <plugin>/dist/cli/harness.mjs writing analyze <file>` before and after editing; findings are evidence, not automatic rewrite commands."]
      : []),
    "Preserve facts, numbers, URLs, identifiers, citations, code, and requested structure.",
  ].join("\n");
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", professionalWritingContext()));
}

export async function runUserPromptSubmit(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; prompt routing was skipped");
  const context = writingPromptContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}

function displayPath(cwd: string, filePath: string): string {
  const local = relative(cwd, filePath);
  return local && !local.startsWith("..") ? local : filePath;
}

function shellWord(value: string): string {
  if (value.length >= 2 && (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  )) return value.slice(1, -1);
  return value;
}

function sedInPlaceTargets(event: HookEvent): string[] {
  const command = extractShellCommand(event);
  if (!command) return [];
  const cwd = eventCwd(event);
  const paths: string[] = [];
  for (const segment of command.split(/&&|\|\||[;|]/u)) {
    const words = segment.match(/"[^"]*"|'[^']*'|[^\s]+/gu) ?? [];
    const sed = words.findIndex((word) => /(?:^|[\\/])sed$/u.test(shellWord(word)));
    if (sed < 0) continue;
    let index = sed + 1;
    let inPlace = false;
    let expressionProvided = false;
    while (index < words.length) {
      const word = shellWord(words[index] ?? "");
      if (word === "--in-place" || word.startsWith("--in-place=") || /^-[^-]*i/u.test(word)) {
        inPlace = true;
        index += 1;
        continue;
      }
      if (word === "-e" || word === "-f" || word === "--expression" || word === "--file") {
        expressionProvided = true;
        index += 2;
        continue;
      }
      if (word.startsWith("--expression=") || word.startsWith("--file=")) {
        expressionProvided = true;
        index += 1;
        continue;
      }
      if (word.startsWith("-")) {
        index += 1;
        continue;
      }
      break;
    }
    if (!inPlace) continue;
    if (!expressionProvided) index += 1;
    for (const word of words.slice(index)) {
      const target = shellWord(word);
      if (!target || target.startsWith("-") || /[*?[\]<>]/u.test(target)) continue;
      paths.push(resolve(cwd, target));
    }
  }
  return paths;
}

function markdownTargets(event: HookEvent): string[] {
  const cwd = eventCwd(event);
  const response = eventToolResponse(event);
  const changes = isRecord(response) && isRecord(response.changes)
    ? Object.keys(response.changes).map((filePath) => resolve(cwd, filePath))
    : [];
  return [...new Set([
    ...extractFileTargets(event, { tools: "mutation", includeShellWrites: true }),
    ...sedInPlaceTargets(event),
    ...changes,
  ])]
    .filter((filePath) => MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .filter((filePath) => !IGNORED_PATH.test(filePath))
    .slice(0, MAX_MARKDOWN_FILES);
}

function scanMarkdownTarget(cwd: string, filePath: string): {
  findings: LocatedFinding[];
  skipped: SkippedTarget[];
} {
  const path = displayPath(cwd, filePath);
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return { findings: [], skipped: [] };
    if (stat.size > MAX_MARKDOWN_BYTES) {
      return {
        findings: [],
        skipped: [{ path, reason: `file exceeds the ${MAX_MARKDOWN_BYTES}-byte automatic scan limit` }],
      };
    }
    return {
      findings: analyzeAiStyle(readFileSync(filePath, "utf8")).map((finding) => ({ ...finding, path })),
      skipped: [],
    };
  } catch {
    return { findings: [], skipped: [] };
  }
}

export function markdownPostToolReport(event: HookEvent): string {
  const cwd = eventCwd(event);
  const findings: LocatedFinding[] = [];
  const skipped: SkippedTarget[] = [];
  for (const filePath of markdownTargets(event)) {
    const result = scanMarkdownTarget(cwd, filePath);
    findings.push(...result.findings);
    skipped.push(...result.skipped);
  }
  if (!findings.length && !skipped.length) return "";
  return [
    "[Professional Writing] Markdown AI-style findings after observed write",
    ...findings.slice(0, MAX_REPORTED_FINDINGS).map((finding) => (
      `- [${finding.severity}] ${finding.id} ${finding.path}:${finding.line} ${finding.message} ${finding.suggestion}`
    )),
    ...skipped.map((item) => `- [report] ${item.path}: automatic scan skipped because ${item.reason}; run the bundled analyzer CLI explicitly.`),
    "Treat each finding as review evidence, not an automatic rewrite instruction. Preserve facts, quotations, code, links, and intentional voice.",
  ].join("\n");
}

export async function runPostToolUse(event?: HookEvent): Promise<void> {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; Markdown scan was skipped");
  const report = markdownPostToolReport(current);
  if (report) {
    writeJson(process.env.HARNESS_HOST === "codex"
      ? {
          continue: false,
          stopReason: "Markdown AI-style review feedback replaced the ordinary tool success output.",
          reason: report,
        }
      : additionalContext("PostToolUse", report));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === "post"
    ? runPostToolUse
    : process.argv[2] === "prompt" || process.argv[2] === "user-prompt"
      ? runUserPromptSubmit
      : runSessionStart;
  run().catch((error: unknown) => warn(error instanceof Error ? error.message : String(error)));
}

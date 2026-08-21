#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeEncoding, type EncodingIssue } from "./encoding-policy.js";
import { eventCwd, eventToolInput, eventToolName, isRecord, type HookEvent } from "@harness/core/hook-event";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CONFIG_FILE_NAME = ".source-integrity.mjs";

export type EncodingRule = {
  match: RegExp;
  mode: "block" | "skip";
};

export const BUILTIN_RULES: EncodingRule[] = [
  {
    match:
      /(^|\/)(?:node_modules|vendor|dist|build|coverage|target|\.next|\.nuxt|generated|__generated__)\//u,
    mode: "skip",
  },
  {
    match:
      /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|inl|ipp|tpp|ixx|cppm|cs|go|java|kt|kts|php|twig|py|r|rb|rs|swift|ts|tsx|js|jsx|mjs|cjs)$/iu,
    mode: "block",
  },
  {
    match:
      /\.(?:graphql|gql|vue|svelte|html|htm|css|scss|less|sass|svg|ejs|hbs|wxml|wxss|wxs)$/iu,
    mode: "block",
  },
  {
    match:
      /\.(?:json|yaml|yml|toml|ini|cfg|sh|bash|zsh|fish|lua|pl|pm|md|txt|rst|adoc|xml|xsl|xsd|sql)$/iu,
    mode: "block",
  },
  {
    match: /(^|\/)(?:\.dockerignore|\.editorconfig|\.env|\.gitignore)$/iu,
    mode: "block",
  },
  { match: /(^|\/)\.env\.[^/]+$/iu, mode: "block" },
];

function warnConfig(message: string) {
  process.stderr.write(`[source-integrity] ${message}\n`);
}

export function normalizeUserRule(
  rule: unknown,
  index: number,
  warn: (message: string) => void = warnConfig,
): EncodingRule | null {
  if (!isRecord(rule) || !(rule.match instanceof RegExp)) {
    warn(`rule[${index}]: "match" must be a RegExp, skipping`);
    return null;
  }
  const mode = rule.mode ?? "block";
  if (mode !== "block" && mode !== "skip") {
    warn(`rule[${index}]: "mode" must be "block" or "skip", skipping`);
    return null;
  }
  return { match: rule.match, mode };
}

export function resolveRules(
  userConfig: unknown,
  warn: (message: string) => void = warnConfig,
): EncodingRule[] {
  const record = isRecord(userConfig) ? userConfig : undefined;
  if (record?.rules !== undefined && !Array.isArray(record.rules)) {
    warn('config "rules" must be an array; using built-in rules');
    return [...BUILTIN_RULES];
  }
  const userRules = (Array.isArray(record?.rules) ? record.rules : [])
    .map((rule, index) => normalizeUserRule(rule, index, warn))
    .filter((rule): rule is EncodingRule => rule !== null);
  return [...userRules, ...BUILTIN_RULES];
}

export function matchRule(relativePath: string, rules: readonly EncodingRule[]): EncodingRule | null {
  for (const rule of rules) {
    try {
      if (new RegExp(rule.match.source, rule.match.flags).test(relativePath)) {
        return rule;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function loadUserConfig(repoRoot: string): Promise<unknown> {
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warnConfig(`failed to load ${CONFIG_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function extractFilePaths(event: HookEvent): string[] {
  const cwd = eventCwd(event);
  const paths = extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true,
  });
  const command = extractShellCommand({ ...event, tool_name: eventToolName(event) || "Bash", tool_input: eventToolInput(event) }) ?? "";
  for (const match of command.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    const raw = match[1];
    if (raw) paths.push(isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw.replace(/^\.\//u, "")));
  }
  return [...new Set(paths)];
}

function resolveRepoRoot(filePath: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(filePath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function relativeMatchPath(filePath: string, repoRoot: string | null, cwd: string): string {
  if (repoRoot) return relative(repoRoot, filePath).replaceAll("\\", "/");
  const fromCwd = relative(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../") ? filePath.replaceAll("\\", "/") : fromCwd;
}

function readFileCapped(filePath: string): Buffer | null {
  try {
    if (statSync(filePath).size > MAX_FILE_BYTES) return null;
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

function formatIssue(issue: EncodingIssue): string {
  if (issue.kind === "bom") {
    return `Detected ${issue.name} (${issue.bytes})`;
  }
  return "Detected an invalid UTF-8 byte sequence";
}

function block(findings: Array<{ path: string; issue: EncodingIssue }>): never {
  const details = findings.flatMap(({ path, issue }) => [
    `- ${path}`,
    `  ${formatIssue(issue)}`,
  ]);
  process.stderr.write(
    [
      "[Encoding Guard] Prohibited file encoding detected",
      ...details,
      "",
      "blockingContract:",
      "  observedFacts: A target text file contains a BOM or is not strict UTF-8.",
      "  harm: Incorrect encodings can cause cross-platform parsing differences, garbled text, or build failures.",
      "  unblockWhen: Every listed file is saved as UTF-8 without a BOM.",
      "  recovery: For a UTF-8 BOM, remove only the leading signature; for other encodings, confirm the source encoding and convert losslessly instead of guessing with replacement characters.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

export async function runEncodingPost(event: HookEvent) {
  const cwd = eventCwd(event);
  const candidates = extractFilePaths(event).filter(existsSync);
  if (candidates.length === 0) return;

  const firstCandidate = candidates[0];
  if (!firstCandidate) return;
  const repoRoot = resolveRepoRoot(firstCandidate);
  const userConfig = repoRoot ? await loadUserConfig(repoRoot) : null;
  const rules = resolveRules(userConfig);
  const findings: Array<{ path: string; issue: EncodingIssue }> = [];

  for (const filePath of candidates) {
    const matchPath = relativeMatchPath(filePath, repoRoot, cwd);
    const rule = matchRule(matchPath, rules);
    if (!rule || rule.mode === "skip") continue;
    const buffer = readFileCapped(filePath);
    if (buffer === null) continue;
    const issue = analyzeEncoding(buffer);
    if (issue) findings.push({ path: matchPath, issue });
    if (findings.length >= 10) break;
  }

  if (findings.length > 0) block(findings);
}

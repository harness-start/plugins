#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeEncoding } from "../../lib/encoding-policy.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CONFIG_FILE_NAMES = [
  ".encoding-guard.mjs",
  ".encoding-guard.cjs",
  ".encoding-guard.js",
];

export const BUILTIN_RULES = [
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

function warnConfig(message) {
  process.stderr.write(`[encoding-guard] ${message}\n`);
}

export function normalizeUserRule(rule, index, warn = warnConfig) {
  if (!rule || !(rule.match instanceof RegExp)) {
    warn(`rule[${index}]: "match" must be a RegExp, skipping`);
    return null;
  }
  const mode = rule.mode ?? "block";
  if (mode !== "block" && mode !== "skip") {
    warn(`rule[${index}]: "mode" must be "block" or "skip", skipping`);
    return null;
  }
  return { ...rule, mode };
}

export function resolveRules(userConfig, warn = warnConfig) {
  if (userConfig?.rules !== undefined && !Array.isArray(userConfig.rules)) {
    warn('config "rules" must be an array; using built-in rules');
    return [...BUILTIN_RULES];
  }
  const userRules = (userConfig?.rules ?? [])
    .map((rule, index) => normalizeUserRule(rule, index, warn))
    .filter(Boolean);
  return [...userRules, ...BUILTIN_RULES];
}

export function matchRule(relativePath, rules) {
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

export async function loadUserConfig(repoRoot) {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = join(repoRoot, name);
    if (!existsSync(configPath)) continue;
    try {
      const loaded = await import(pathToFileURL(configPath).href);
      return loaded.default ?? loaded;
    } catch (error) {
      warnConfig(`failed to load ${name}: ${error.message}`);
      return null;
    }
  }
  return null;
}

function extractToolInput(event) {
  return (
    event?.tool_input ??
    event?.toolInput ??
    event?.tool?.input ??
    event?.input ??
    {}
  );
}

function stripMatchingQuotes(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function extractFilePaths(event) {
  const toolInput = extractToolInput(event);
  const cwd =
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd();
  const paths = [];

  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "output_file",
    "outputFile",
  ]) {
    if (typeof toolInput?.[key] === "string" && toolInput[key]) {
      paths.push(toolInput[key]);
    }
  }

  const patchPayload = [toolInput?.patch, toolInput?.input, toolInput?.command]
    .filter((value) => typeof value === "string")
    .join("\n");
  for (const line of patchPayload.split("\n")) {
    const match = line.match(
      /^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u,
    );
    if (match) paths.push(match[1].trim());
  }

  const command =
    (typeof toolInput?.command === "string" && toolInput.command) ||
    (typeof toolInput?.cmd === "string" && toolInput.cmd) ||
    "";
  for (const match of command.matchAll(
    /(?:^|[\s;])(?:\d*>>?|&>)\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu,
  )) {
    paths.push(stripMatchingQuotes(match[1]));
  }
  for (const match of command.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    paths.push(stripMatchingQuotes(match[1]));
  }

  return [
    ...new Set(
      paths
        .filter(Boolean)
        .map((path) =>
          isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
        ),
    ),
  ];
}

function resolveRepoRoot(filePath) {
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

function relativeMatchPath(filePath, repoRoot, cwd) {
  if (repoRoot) return relative(repoRoot, filePath).replaceAll("\\", "/");
  const fromCwd = relative(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../") ? filePath.replaceAll("\\", "/") : fromCwd;
}

function readFileCapped(filePath) {
  try {
    if (statSync(filePath).size > MAX_FILE_BYTES) return null;
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

function formatIssue(issue) {
  if (issue.kind === "bom") {
    return `Detected ${issue.name} (${issue.bytes})`;
  }
  return "Detected an invalid UTF-8 byte sequence";
}

function block(findings) {
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

async function main() {
  let rawInput = "";
  for await (const chunk of process.stdin) rawInput += chunk;

  let event;
  try {
    event = JSON.parse(rawInput || "{}");
  } catch {
    return;
  }

  const cwd =
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd();
  const candidates = extractFilePaths(event).filter(existsSync);
  if (candidates.length === 0) return;

  const repoRoot = resolveRepoRoot(candidates[0]);
  const userConfig = repoRoot ? await loadUserConfig(repoRoot) : null;
  const rules = resolveRules(userConfig);
  const findings = [];

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

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch(() => process.exit(0));
}

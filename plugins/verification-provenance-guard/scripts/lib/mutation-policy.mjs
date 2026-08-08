import { isAbsolute, resolve } from "node:path";

import { extractCwd, extractToolInput, extractToolName } from "./hook-io.mjs";

const FILE_TOOLS = new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write",
]);

const TEST_PATH = /(?:^|\/)(?:__tests__|spec|specs|test|tests)(?:\/|$)|(?:\.test|\.spec)\.[^/]+$|(?:_test|Test)\.[^/]+$/iu;
const NON_CODE_PATH = /(?:^|\/)(?:artifacts?|coverage|docs?|reports?)(?:\/|$)|\.(?:adoc|csv|gif|jpe?g|md|mdx|pdf|png|rst|svg|tsv|txt|zip)$/iu;
const CODE_PATH = /\.(?:c|cc|cjs|clj|cljs|cpp|cs|cts|cxx|dart|ex|exs|fs|fsx|go|h|hh|hpp|hxx|java|js|jsx|kt|kts|lua|m|mjs|mm|mts|php|pl|pm|py|pyi|r|rb|rs|scala|sh|sol|swift|ts|tsx|vue)$/iu;

function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}

export function extractPatchTargets(payload) {
  if (typeof payload !== "string") return [];
  const targets = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file) targets.push(stripQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) targets.push(stripQuotes(move[1]));
  }
  return targets;
}

export function extractFileTargets(event) {
  if (!FILE_TOOLS.has(canonicalToolName(extractToolName(event)))) return [];
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const targets = objectPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
  targets.push(...extractPatchTargets(patch));
  return [...new Set(targets.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

function matches(patterns, value) {
  return (patterns ?? []).some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function classifyMutationPath(path, config = {}) {
  const value = String(path ?? "").replaceAll("\\", "/");
  if (matches(config.testPatterns, value) || TEST_PATH.test(value)) return "test";
  if (matches(config.nonCodePatterns, value) || NON_CODE_PATH.test(value)) return "non_code";
  if (matches(config.codePatterns, value) || CODE_PATH.test(value)) return "code";
  return "unknown";
}

export function mutationScopes(event, config = {}) {
  const targets = extractFileTargets(event);
  if (targets.length === 0) return ["unknown"];
  return [...new Set(targets.map((path) => classifyMutationPath(path, config)))];
}

export function extractShellMutationTargets(command, cwd = process.cwd()) {
  const value = String(command ?? "");
  const targets = [];
  for (const match of value.matchAll(/(?:^|[\s;&|])\d*>{1,2}\s*(?!&)("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    const target = stripQuotes(match[1]);
    if (target !== "/dev/null") targets.push(target);
  }
  for (const match of value.matchAll(/(?:^|[;&|]\s*)(?:mkdir|touch|rm)\s+(?:-[^\s]+\s+)*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    targets.push(stripQuotes(match[1]));
  }
  return [...new Set(targets.filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

export function shellMutationScopes(command, cwd, config = {}) {
  const targets = extractShellMutationTargets(command, cwd);
  if (targets.length === 0) return ["unknown"];
  return [...new Set(targets.map((path) => classifyMutationPath(path, config)))];
}

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import { extractToolResponse } from "./hook-io.js";

const READ_ONLY_COMMAND_RE =
  /^\s*(?:ls|cat|head|tail|echo|git\s+(?:status|diff|log|show|ls-files)|pwd|which|wc|find|grep|rg)\b/iu;
const TRAILING_OBSERVER_PIPE_RE = /\s*\|\s*(?:tail|head|less|more|tee|cat)\b[^|]*$/iu;
const REMOTE_POLL_RE = new RegExp([
  String.raw`\b(?:glab\s+(?:ci\s+(?:list|status|get|view|trace)`,
  String.raw`|api\s+\S*(?:pipeline|job|release|deploy)s?)`,
  String.raw`|gh\s+(?:run\s+(?:list|view|watch)`,
  String.raw`|pr\s+checks|workflow\s+view))\b`,
].join(""), "iu");

const VERIFY_PATTERNS = [
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck|check|build)\b/iu,
  /\bbun\s+(?:test|run\s+(?:test|lint|typecheck|check|build))\b/iu,
  /\bnode\s+--test\b/iu,
  /\b(?:pytest|vitest|jest|phpunit|rspec|phpstan|eslint|shellcheck|actionlint|kubeconform)\b/iu,
  /\bpython(?:3)?\s+-m\s+(?:pytest|compileall)\b/iu,
  /\bgo\s+test\b/iu,
  /\bcargo\s+(?:test|check|clippy)\b/iu,
  /\b(?:mvn|gradlew?|gradle)\b[^\n]*\b(?:test|check|verify|build)\b/iu,
  /\bcomposer\s+validate\b/iu,
  /\bruff\s+check\b/iu,
  /\btsc\b/iu,
  /\b(?:terraform|tofu)\s+(?:validate|fmt\s+-check)\b/iu,
];

export function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function normalizeCommand(command) {
  let normalized = String(command ?? "").replace(/\s+#\s*retry-ok\b.*$/iu, "").trim();
  normalized = normalized.replace(/\s+2>&1/gu, " ");
  normalized = normalized.replace(/\s+(?:1>>|2>>|1>|2>|>>|>)\s*(?:"[^"]+"|'[^']+'|\S+)\s*$/gu, "");
  while (TRAILING_OBSERVER_PIPE_RE.test(normalized)) {
    normalized = normalized.replace(TRAILING_OBSERVER_PIPE_RE, "").trim();
  }
  return normalized.replace(/\s+/gu, " ").replace(/;+$/u, "").trim();
}

function stripLeadingAssignments(command) {
  let rest = command.trim();
  while (true) {
    const next = rest.match(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+([\s\S]+)$/u);
    if (!next) return rest;
    rest = (next[1] ?? "").trim();
  }
}

export function isReadOnlyCommand(command) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return true;
  const stripped = stripLeadingAssignments(trimmed);
  if (READ_ONLY_COMMAND_RE.test(stripped)) return true;
  const assignmentSubshell = trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*=\$\(([\s\S]*)\)$/u);
  return assignmentSubshell
    ? READ_ONLY_COMMAND_RE.test(stripLeadingAssignments(normalizeCommand(assignmentSubshell[1] ?? "")))
    : false;
}

export function commandHash(command) {
  return createHash("sha256").update(normalizeCommand(command)).digest("hex");
}

function directCommandWords(command) {
  const words = [];
  let word = "";
  let quote = null;
  let escaped = false;
  const source = String(command ?? "").trim();
  if (!source || /[\r\n]/u.test(source)) return null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      word += character;
      escaped = false;
    } else if (character === "\\") escaped = true;
    else if (quote) {
      if (character === quote) quote = null;
      else word += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/u.test(character)) {
      if (word) words.push(word);
      word = "";
    } else if (";&|<>`".includes(character) || (character === "$" && source[index + 1] === "(")) return null;
    else word += character;
  }
  if (quote || escaped) return null;
  if (word) words.push(word);
  return words;
}

export function commandInputFingerprint(command, cwd, repoRoot) {
  const words = directCommandWords(command);
  if (!words?.length) return null;
  const root = resolve(repoRoot);
  const inputs = [];
  for (const word of words) {
    const candidate = resolve(cwd, word.replace(/^\.\//u, ""));
    try {
      const real = realpathSync(candidate);
      const rel = relative(root, real).replaceAll("\\", "/");
      if (!rel || rel === ".." || rel.startsWith("../") || !existsSync(real) || !lstatSync(real).isFile()) continue;
      inputs.push(`${rel}\0${createHash("sha256").update(readFileSync(real)).digest("hex")}`);
    } catch {}
  }
  if (inputs.length === 0) return null;
  return createHash("sha256").update([...new Set(inputs)].sort().join("\0")).digest("hex");
}

export function failureSignature(command, response) {
  let serialized = "";
  try { serialized = JSON.stringify(response ?? null); } catch { serialized = String(response ?? ""); }
  const normalizedResponse = serialized.replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").trim().slice(-8192);
  return createHash("sha256").update(`${normalizeCommand(command)}\0${normalizedResponse}`).digest("hex");
}

export function inferCommandOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (typeof response === "string") {
    const matches = [...response.matchAll(/(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu)];
    const code = matches.at(-1)?.[1];
    if (code !== undefined) return Number.parseInt(code, 10) === 0 ? "success" : "failure";
  }
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code ?? response.status;
    if (typeof code === "number") return code === 0 ? "success" : "failure";
    if (response.success === false || response.is_error === true || response.isError === true) return "failure";
    if (response.success === true) return "success";
  }
  return "unknown";
}

export function isVerificationCommand(command) {
  const normalized = normalizeCommand(command);
  return VERIFY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function estimateSleepSeconds(command, settings) {
  let total = 0;
  for (const match of String(command).matchAll(/\bsleep\s+(\d+(?:\.\d+)?)\b/giu)) total += Number(match[1]);
  if (total <= 0) return 0;
  const range = String(command).match(/\bfor\s+\w+\s+in\s+\{(\d+)\.\.(\d+)\}/iu);
  if (range) {
    const iterations = Number(range[2]) - Number(range[1]) + 1;
    if (iterations > 1) total *= iterations;
  } else if (/\bwhile\s+/iu.test(String(command))) {
    total *= settings.whileLoopAssumedIterations;
  }
  return Math.min(total, settings.maxSleepPerCommandSeconds);
}

export function countRemotePolls(command) {
  return REMOTE_POLL_RE.test(String(command)) ? 1 : 0;
}

import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord, type HookEvent } from "@harness/core/hook-event";

import { extractCwd, extractFileTargets, extractShellCommand, isFileMutationTool, isShellTool } from "./hook-io.js";
import { parseReportArgs, type ReportAction, type ReportArgs, type ReportKind } from "./report-cli.js";
import type { ReportHookState } from "./hook-state.js";
import { isProtectedReportPath, reportPath } from "./report-store.js";
import { sha256 } from "./report-integrity.js";
import { readFile } from "node:fs/promises";

export type OfficialCommandError = {
  kind: ReportKind;
  action: ReportAction;
  script: string;
  error: string;
};

export type OfficialCommandOk = {
  kind: ReportKind;
  action: ReportAction;
  script: string;
  args: ReportArgs;
};

export type OfficialCommand = OfficialCommandOk | OfficialCommandError;

export type ProtectionOptions = {
  home?: string | undefined;
  state?: Partial<ReportHookState> | undefined;
  pluginRoot?: string | undefined;
};

export type ProtectionDecision =
  | { deny: true; reason: string; official?: OfficialCommand | undefined }
  | { deny: false; official?: OfficialCommandOk | undefined };

const OFFICIAL = new Map<string, readonly [ReportKind, ReportAction]>([
  ["daily-work-report-collect.mjs", ["daily", "collect"]],
  ["daily-work-report-transcript-scan.mjs", ["daily", "scan"]],
  ["daily-work-report-prepare.mjs", ["daily", "prepare"]],
  ["daily-work-report-save.mjs", ["daily", "save"]],
  ["weekly-work-report-collect.mjs", ["weekly", "collect"]],
  ["weekly-work-report-transcript-scan.mjs", ["weekly", "scan"]],
  ["weekly-work-report-prepare.mjs", ["weekly", "prepare"]],
  ["weekly-work-report-save.mjs", ["weekly", "save"]],
  ["work-summary-report-collect.mjs", ["summary", "collect"]],
  ["work-summary-report-transcript-scan.mjs", ["summary", "scan"]],
  ["work-summary-report-prepare.mjs", ["summary", "prepare"]],
  ["work-summary-report-save.mjs", ["summary", "save"]],
  ["work-report-insights-addition-prepare.mjs", ["report", "addition-prepare"]],
  ["work-report-insights-append.mjs", ["report", "append"]],
  ["work-report-insights-verify.mjs", ["report", "verify"]],
]);
const DEFAULT_PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function tokenize(command: string): string[] | null {
  if (/[;&|<>`\n]|\$\(/u.test(command)) return null;
  return (command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/gu) ?? []).map((token) => {
    if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) return token.slice(1, -1);
    return token;
  });
}

function errorMessage(error: unknown): string {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}

export function hasOfficialError(official: OfficialCommand): official is OfficialCommandError {
  return "error" in official;
}

export function parseOfficialCommand(command: unknown): OfficialCommand | null {
  const tokens = tokenize(String(command ?? ""));
  if (!tokens) return null;
  let index = 0;
  const assignments: string[] = [];
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index] ?? "")) {
    const assignment = tokens[index];
    if (assignment === undefined) break;
    assignments.push(assignment);
    index += 1;
  }
  if (basename(tokens[index] ?? "") !== "node") return null;
  const script = tokens[index + 1];
  const contract = OFFICIAL.get(basename(script ?? ""));
  if (!contract || script === undefined) return null;
  const [kind, action] = contract;
  if (assignments.some((item) => /^(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)=/u.test(item))) {
    return { kind, action, script, error: "host-owned plugin root must not be overridden" };
  }
  try {
    return { kind, action, script, args: parseReportArgs(kind, action, tokens.slice(index + 2)) };
  } catch (error) {
    return { kind, action, script, error: errorMessage(error) };
  }
}

export async function officialScriptTrusted(
  official: OfficialCommand | null | undefined,
  options: { pluginRoot?: string | undefined; cwd?: string | undefined } = {},
): Promise<boolean> {
  if (!official?.script || !OFFICIAL.has(basename(official.script))) return false;
  if (/^\$\{(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/dist\/cli\/[a-z0-9-]+\.mjs$/u.test(official.script)) return true;
  const pluginRoot = resolve(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
  const cwd = resolve(options.cwd ?? process.cwd());
  const actual = resolve(cwd, official.script);
  const expected = join(pluginRoot, "dist", "cli", basename(official.script));
  return await physicalPath(actual) === await physicalPath(expected);
}

function reportsRoot(home: string): string {
  return resolve(home, ".ai-experts");
}

function inside(candidate: string, parent: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}

async function physicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    try {
      return join(await realpath(dirname(path)), basename(path));
    } catch {
      return resolve(path);
    }
  }
}

async function protectedCandidate(path: string, home: string): Promise<boolean> {
  const lexical = resolve(path);
  if (isProtectedReportPath(lexical, home)) return true;
  const physical = await physicalPath(lexical);
  return isProtectedReportPath(physical, home);
}

function shellMutates(command: unknown): boolean {
  const text = String(command ?? "");
  return /(?:^|[\s(])(?:\/[\w./-]+\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install|touch|mkdir)\b/iu.test(text)
    || /(?:^|[^<])>{1,2}\s*[^&]/u.test(text)
    || /\bfind\b[\s\S]*(?:-delete|-exec|-execdir)\b/iu.test(text)
    || /\bsed\b[\s\S]*(?:-[A-Za-z]*i[A-Za-z]*|--in-place)\b/iu.test(text)
    || /\b(?:python3?|node|ruby|perl)\b[\s\S]*(?:writeFile|unlink|rename|truncate|open\s*\([^)]*["']w)/iu.test(text);
}

function shellTokens(command: unknown, home: string): string[] {
  const raw = String(command ?? "").match(/"(?:\\.|[^"])*"|'[^']*'|[^\s;|&<>`]+/gu) ?? [];
  return raw.map((token) => token.replace(/^['"]|['"]$/gu, ""))
    .map((token) => token.replace(/^\$\{HOME\}|^\$HOME|^~/u, home))
    .filter((token) => token && !token.startsWith("-") && (isAbsolute(token) || token.startsWith(".")));
}

async function shellTargetsReports(command: string, cwd: string, home: string): Promise<boolean> {
  const root = reportsRoot(home);
  if (String(command).includes(".ai-experts")) return true;
  for (const token of shellTokens(command, home)) {
    const candidate = resolve(cwd, token);
    const physical = await physicalPath(candidate);
    if (isProtectedReportPath(candidate, home) || isProtectedReportPath(physical, home)) return true;
    if (/\b(?:rm|mv|find)\b[\s\S]*(?:-r|-R|--recursive|-delete)/iu.test(command) && (inside(root, candidate) || inside(candidate, root) || inside(root, physical) || inside(physical, root))) return true;
  }
  return false;
}

async function candidateDigest(path: string): Promise<string> {
  const body = await readFile(resolve(path), "utf8");
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return sha256(normalized);
}

function denyReason(detail: string): string {
  return `[Work Report Insights] Protected report\n\n${detail}\nConfirmed report bytes are immutable. Use the plugin prepare/confirm/save or addition-prepare/confirm/append workflow.`;
}

function requiredArg(value: string | undefined, flag: string): string {
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

export async function protectionDecision(event: HookEvent, options: ProtectionOptions = {}): Promise<ProtectionDecision> {
  const home = resolve(options.home ?? process.env.HOME ?? homedir());
  const state = options.state ?? { phase: "idle" };
  if (isFileMutationTool(event)) {
    for (const target of extractFileTargets(event)) {
      if (await protectedCandidate(target, home)) return { deny: true, reason: denyReason(`Blocked direct file mutation: ${target}`) };
    }
    return { deny: false };
  }
  if (!isShellTool(event)) return { deny: false };
  const command = extractShellCommand(event) ?? "";
  const official = parseOfficialCommand(command);
  if (official && hasOfficialError(official)) return { deny: true, reason: denyReason(`Invalid official command: ${official.error}`) };
  if (official) {
    if (!await officialScriptTrusted(official, { pluginRoot: options.pluginRoot, cwd: extractCwd(event) })) {
      return { deny: true, reason: denyReason("A reserved official command name was invoked from an untrusted script path.") };
    }
    if (official.action !== "save" && official.action !== "append") return { deny: false, official };
    if (state.phase !== "prepared" || state.operation !== official.action) return { deny: true, reason: denyReason("The candidate has not been prepared.") };
    const input = resolve(extractCwd(event), requiredArg(official.args.input, "--input"));
    if (state.candidatePath !== input || state.candidateSha256 !== await candidateDigest(input)) return { deny: true, reason: denyReason("The candidate bytes changed after confirmation.") };
    const target = official.action === "save"
      ? reportPath({ kind: official.kind, ...official.args, home })
      : resolve(extractCwd(event), requiredArg(official.args.report, "--report"));
    if (state.target !== target) return { deny: true, reason: denyReason("The confirmed target does not match this command.") };
    if (official.action === "append" && state.reportSha256 !== sha256(await readFile(target))) {
      return { deny: true, reason: denyReason("The sealed report changed after the addition was prepared.") };
    }
    return { deny: false, official };
  }
  if (shellMutates(command) && await shellTargetsReports(command, extractCwd(event), home)) {
    return { deny: true, reason: denyReason("Shell mutation targets the report tree or a resolved report symlink.") };
  }
  return { deny: false };
}

import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { commandInvocation, shellCommandInvocations, type ShellInvocation } from "@harness/core/shell-parse";

import { extractCwd, extractFileTargets, extractShellCommand, isFileMutationTool, isShellTool } from "./hook-io.js";
import { parseReportArgs, type ReportAction, type ReportArgs, type ReportKind } from "./report-cli.js";
import type { ReportHookState } from "./hook-state.js";
import { isProtectedReportPath, reportPath } from "./report-store.js";
import { sha256 } from "./report-integrity.js";
import { readReportCandidate } from "./report-candidate.js";

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
  ["daily-collect", ["daily", "collect"]],
  ["daily-transcript-scan", ["daily", "scan"]],
  ["daily-prepare", ["daily", "prepare"]],
  ["daily-save", ["daily", "save"]],
  ["weekly-collect", ["weekly", "collect"]],
  ["weekly-transcript-scan", ["weekly", "scan"]],
  ["weekly-prepare", ["weekly", "prepare"]],
  ["weekly-save", ["weekly", "save"]],
  ["summary-collect", ["summary", "collect"]],
  ["summary-transcript-scan", ["summary", "scan"]],
  ["summary-prepare", ["summary", "prepare"]],
  ["summary-save", ["summary", "save"]],
  ["addition-prepare", ["report", "addition-prepare"]],
  ["append", ["report", "append"]],
  ["verify", ["report", "verify"]],
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
  if (basename(script ?? "") !== "harness.mjs" || tokens[index + 2] !== "report") return null;
  const contract = OFFICIAL.get(tokens[index + 3] ?? "");
  if (!contract || script === undefined) return null;
  const [kind, action] = contract;
  if (assignments.some((item) => /^(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)=/u.test(item))) {
    return { kind, action, script, error: "host-owned plugin root must not be overridden" };
  }
  try {
    return { kind, action, script, args: parseReportArgs(kind, action, tokens.slice(index + 4)) };
  } catch (error) {
    return { kind, action, script, error: errorMessage(error) };
  }
}

export async function officialScriptTrusted(
  official: OfficialCommand | null | undefined,
  options: { pluginRoot?: string | undefined; cwd?: string | undefined } = {},
): Promise<boolean> {
  if (!official?.script || basename(official.script) !== "harness.mjs") return false;
  if (/^\$\{(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/dist\/cli\/harness\.mjs$/u.test(official.script)) return true;
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

const DIRECT_MUTATORS = new Set([
  "chmod",
  "chown",
  "cp",
  "dd",
  "install",
  "mkdir",
  "mv",
  "rm",
  "rsync",
  "shred",
  "tee",
  "touch",
  "truncate",
  "unlink",
]);
const SCRIPT_RUNTIMES = new Set(["node", "nodejs", "perl", "python", "python2", "python3", "ruby"]);
const SHELL_RUNTIMES = new Set(["bash", "dash", "sh", "zsh"]);

function sedMutates(args: readonly string[]): boolean {
  return args.some((argument) => argument === "--in-place" || argument.startsWith("--in-place=") || /^-[A-Za-z]*i[A-Za-z]*$/u.test(argument));
}

function nestedFindCommands(args: readonly string[]): ShellInvocation[] {
  const nested: ShellInvocation[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "-exec" && args[index] !== "-execdir") continue;
    const end = args.findIndex((argument, candidate) => candidate > index && (argument === ";" || argument === "+"));
    const words = args.slice(index + 1, end < 0 ? undefined : end);
    const invocation = commandInvocation(words);
    if (invocation) nested.push(invocation);
    if (end >= 0) index = end;
  }
  return nested;
}

function invocationMutates(invocation: ShellInvocation, depth: number): boolean {
  const executable = invocation.executable.toLowerCase();
  if (DIRECT_MUTATORS.has(executable)) return true;
  if (executable === "sed") return sedMutates(invocation.args);
  if (executable === "find") {
    return invocation.args.includes("-delete")
      || nestedFindCommands(invocation.args).some((nested) => invocationMutates(nested, depth));
  }
  if (SCRIPT_RUNTIMES.has(executable)) {
    return /(?:writeFile|unlink|rename|truncate|open\s*\([^)]*["']w)/iu.test(invocation.args.join(" "));
  }
  if (depth >= 4) return false;
  if (executable === "eval") return shellMutates(invocation.args.join(" "), depth + 1);
  if (SHELL_RUNTIMES.has(executable)) {
    const commandIndex = invocation.args.findIndex((argument) => /^-[^-]*c/u.test(argument));
    const nested = commandIndex >= 0 ? invocation.args[commandIndex + 1] : undefined;
    return nested !== undefined && shellMutates(nested, depth + 1);
  }
  return false;
}

function hasOutputRedirection(command: string): boolean {
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (character === ">" && command[index + 1] !== "&") {
      let targetIndex = index + 1;
      if (command[targetIndex] === ">") targetIndex += 1;
      while (/\s/u.test(command[targetIndex] ?? "")) targetIndex += 1;
      const suffix = command.slice(targetIndex);
      const nullTarget = suffix.match(/^(?:"\/dev\/null"|'\/dev\/null'|\/dev\/null)(?=$|[\s;|&])/u);
      if (nullTarget) {
        index = targetIndex + nullTarget[0].length - 1;
        continue;
      }
      return true;
    }
  }
  return false;
}

function shellMutates(command: unknown, depth = 0): boolean {
  const text = String(command ?? "");
  return hasOutputRedirection(text)
    || shellCommandInvocations(text).some((invocation) => invocationMutates(invocation, depth));
}

function recursiveFlag(args: readonly string[]): boolean {
  return args.some((argument) => argument === "--recursive" || (/^-[^-]*[rR]/u.test(argument) && argument !== "--"));
}

function invocationMutatesTree(invocation: ShellInvocation, depth: number): boolean {
  const executable = invocation.executable.toLowerCase();
  if (executable === "find") return invocationMutates(invocation, depth);
  if (executable === "mv") return true;
  if (["chmod", "chown", "cp", "rm", "rsync"].includes(executable)) return recursiveFlag(invocation.args);
  if (depth >= 4) return false;
  if (executable === "eval") return shellMutatesTree(invocation.args.join(" "), depth + 1);
  if (SHELL_RUNTIMES.has(executable)) {
    const commandIndex = invocation.args.findIndex((argument) => /^-[^-]*c/u.test(argument));
    const nested = commandIndex >= 0 ? invocation.args[commandIndex + 1] : undefined;
    return nested !== undefined && shellMutatesTree(nested, depth + 1);
  }
  return false;
}

function shellMutatesTree(command: unknown, depth = 0): boolean {
  return shellCommandInvocations(String(command ?? "")).some((invocation) => invocationMutatesTree(invocation, depth));
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
  const mutatesTree = shellMutatesTree(command);
  for (const token of shellTokens(command, home)) {
    const candidate = resolve(cwd, token);
    const physical = await physicalPath(candidate);
    if (isProtectedReportPath(candidate, home) || isProtectedReportPath(physical, home)) return true;
    if (mutatesTree && (inside(root, candidate) || inside(candidate, root) || inside(root, physical) || inside(physical, root))) return true;
  }
  return false;
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
    const requiredPhase = official.args.contract ? "acknowledged" : "prepared";
    if (state.phase !== requiredPhase || state.operation !== official.action) return { deny: true, reason: denyReason(official.args.contract ? "The V2 candidate has not received a valid employee acknowledgement." : "The candidate has not been prepared.") };
    const candidate = await readReportCandidate(official.args, extractCwd(event));
    if (state.candidatePath !== candidate.candidatePath || state.candidateSha256 !== sha256(candidate.body)) return { deny: true, reason: denyReason("The candidate bytes changed after confirmation.") };
    if (candidate.evidencePath !== state.evidencePath) return { deny: true, reason: denyReason("The evidence bundle changed after confirmation.") };
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

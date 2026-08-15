import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import { SEAL_PREFIX, sha256, verifyReport } from "./report-integrity.js";
import { appendReport, reportPath, saveReport } from "./report-store.js";
import {
  buildReportWindow,
  collectTranscriptActivity,
  scanTranscripts,
  type TranscriptScanReport,
} from "./transcript-scan.js";

export type ReportKind = "daily" | "weekly" | "summary" | "report";
export type ReportAction =
  | "collect"
  | "scan"
  | "prepare"
  | "save"
  | "addition-prepare"
  | "append"
  | "verify";
export type ReportPlatform = "all" | "claude" | "codex";
export type ReportFormat = "json" | "markdown";

export type ReportArgs = {
  platform: ReportPlatform;
  maxSessions: number;
  format: ReportFormat;
  skipGit: boolean;
  help: boolean;
  date?: string | undefined;
  week?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  input?: string | undefined;
  report?: string | undefined;
};

export type ReportCommandInput = {
  kind: ReportKind;
  action: ReportAction;
  argv: string[];
  env?: NodeJS.ProcessEnv | undefined;
  now?: number | undefined;
};

type ParsedArgs = {
  platform: string;
  maxSessions: number;
  format: string;
  skipGit: boolean;
  help: boolean;
  date?: string | undefined;
  week?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  input?: string | undefined;
  report?: string | undefined;
};

type StringFlag = "date" | "week" | "from" | "to" | "input" | "report" | "platform" | "format";

const ACTIONS = new Set<string>(["collect", "scan", "prepare", "save", "addition-prepare", "append", "verify"]);

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value == null || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}

function isReportAction(value: string): value is ReportAction {
  return ACTIONS.has(value);
}

function requiredArg(value: string | undefined, flag: string): string {
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

export function parseReportArgs(kind: string, action: string, argv: string[]): ReportArgs {
  if (!isReportAction(action)) throw new Error(`unknown report action: ${action}`);
  const result: ParsedArgs = { platform: "all", maxSessions: 20, format: "json", skipGit: false, help: false };
  const stringFlags = new Map<string, StringFlag>([
    ["--date", "date"], ["--week", "week"], ["--from", "from"], ["--to", "to"],
    ["--input", "input"], ["--report", "report"], ["--platform", "platform"], ["--format", "format"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return {
        ...result,
        help: true,
        platform: result.platform === "claude" || result.platform === "codex" ? result.platform : "all",
        format: result.format === "markdown" ? result.format : "json",
      };
    }
    if (arg === "--skip-git") {
      result.skipGit = true;
      continue;
    }
    if (arg === "--max-sessions") {
      result.maxSessions = Number.parseInt(valueAfter(argv, index, arg), 10);
      index += 1;
      continue;
    }
    const key = stringFlags.get(arg ?? "");
    if (key) {
      result[key] = valueAfter(argv, index, arg ?? "");
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (result.platform !== "all" && result.platform !== "claude" && result.platform !== "codex") {
    throw new Error("--platform expects claude, codex, or all");
  }
  if (result.format !== "json" && result.format !== "markdown") {
    throw new Error("--format expects json or markdown");
  }
  if (!Number.isInteger(result.maxSessions) || result.maxSessions < 1 || result.maxSessions > 200) throw new Error("--max-sessions expects an integer from 1 to 200");
  if (kind === "summary" && (!result.from || !result.to)) throw new Error("--from and --to are required");
  if ((action === "prepare" || action === "save" || action === "addition-prepare" || action === "append") && !result.input) {
    throw new Error("--input is required");
  }
  if ((action === "addition-prepare" || action === "append" || action === "verify") && !result.report) {
    throw new Error("--report is required");
  }
  return {
    ...result,
    platform: result.platform,
    format: result.format,
  };
}

function periodOptions(kind: string, args: ReportArgs, home: string) {
  return { kind, date: args.date, week: args.week, from: args.from, to: args.to, home };
}

function localDateLabel(now: number): string {
  const date = new Date(now);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function isoWeekLabel(now: number): string {
  const date = new Date(now);
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = thursday.getDay() || 7;
  thursday.setDate(thursday.getDate() + 4 - day);
  const year = thursday.getFullYear();
  const first = new Date(year, 0, 1);
  const week = Math.ceil((((thursday.getTime() - first.getTime()) / 86_400_000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function applyPeriodDefaults(kind: string, args: ReportArgs, now: number): ReportArgs {
  if (kind === "daily" && !args.date) return { ...args, date: localDateLabel(now) };
  if (kind === "weekly" && !args.week) return { ...args, week: isoWeekLabel(now) };
  return args;
}

function renderScanMarkdown(report: TranscriptScanReport): string {
  const lines = [
    `# transcript scan — ${report.window.label}`,
    "",
    `- window: ${report.window.start} → ${report.window.end}`,
    `- sessions: ${report.overview.sessionCount}`,
  ];
  for (const session of report.sessions) {
    lines.push("", `## [${session.platform}] ${session.sessionId}`);
    lines.push(`- project: ${session.project ?? "n/a"}`);
    for (const item of session.evidence) lines.push(`- L${item.line} ${item.role ?? "event"}: ${item.text}`);
  }
  if (report.dataGaps.length > 0) lines.push("", "## data gaps", ...report.dataGaps.map((gap) => `- ${gap}`));
  return lines.join("\n");
}

async function readCandidate(input: string): Promise<string> {
  const value = await readFile(resolve(input), "utf8");
  if (!value.trim()) throw new Error("candidate content is empty");
  if (value.includes(SEAL_PREFIX)) throw new Error("candidate content contains a reserved seal marker");
  return value.endsWith("\n") ? value : `${value}\n`;
}

export async function executeReportCommand({
  kind,
  action,
  argv,
  env = process.env,
  now = Date.now(),
}: ReportCommandInput): Promise<Record<string, unknown>> {
  const args = applyPeriodDefaults(kind, parseReportArgs(kind, action, argv), now);
  if (args.help) return { help: true, kind, action };
  const home = env.HOME || homedir();
  const period = periodOptions(kind, args, home);
  if (action === "collect") return collectTranscriptActivity({ ...period, env, platform: args.platform, maxSessions: args.maxSessions });
  if (action === "scan") {
    const window = buildReportWindow(period);
    return scanTranscripts({ window, env, platform: args.platform, maxSessions: args.maxSessions });
  }
  if (action === "prepare") {
    const body = await readCandidate(requiredArg(args.input, "--input"));
    return { kind, action, target: reportPath(period), candidateSha256: sha256(body), bytes: Buffer.byteLength(body) };
  }
  if (action === "save") {
    return { kind, action, ...await saveReport({ ...period, input: requiredArg(args.input, "--input") }) };
  }
  if (action === "verify") {
    const report = requiredArg(args.report, "--report");
    const content = await readFile(resolve(report), "utf8");
    const checked = verifyReport(content);
    return { kind: "report", action, path: resolve(report), ...checked };
  }
  if (action === "addition-prepare") {
    const report = requiredArg(args.report, "--report");
    const content = await readFile(resolve(report), "utf8");
    const checked = verifyReport(content);
    if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
    const addition = await readCandidate(requiredArg(args.input, "--input"));
    return { kind: "report", action, path: resolve(report), reportSha256: sha256(content), candidateSha256: sha256(addition), bytes: Buffer.byteLength(addition) };
  }
  if (action === "append") {
    return {
      kind: "report",
      action,
      ...await appendReport({
        report: requiredArg(args.report, "--report"),
        input: requiredArg(args.input, "--input"),
        home,
      }),
    };
  }
  throw new Error(`unsupported action: ${action}`);
}

function usage(kind: string, action: string): string {
  const period = kind === "daily" ? "--date YYYY-MM-DD" : kind === "weekly" ? "--week YYYY-Www" : kind === "summary" ? "--from YYYY-MM-DD --to YYYY-MM-DD" : "--report PATH";
  const input = action === "prepare" || action === "save" || action === "addition-prepare" || action === "append" ? " --input PATH" : "";
  return `Usage: ${kind}-${action} ${period}${input}`;
}

function errorMessage(error: unknown): string {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}

function isScanReport(value: Record<string, unknown>): value is TranscriptScanReport {
  return isRecord(value.window) && Array.isArray(value.sessions) && Array.isArray(value.dataGaps) && isRecord(value.overview);
}

export async function runCli(
  kind: ReportKind,
  action: ReportAction,
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  try {
    const result = await executeReportCommand({ kind, action, argv, env });
    if (result.help === true) {
      process.stdout.write(`${usage(kind, action)}\n`);
      return 0;
    }
    const formatIndex = argv.indexOf("--format");
    const format = formatIndex >= 0 ? argv[formatIndex + 1] : "json";
    if (action === "scan" && format === "markdown" && isScanReport(result)) {
      process.stdout.write(`${renderScanMarkdown(result)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n${usage(kind, action)}\n`);
    return 2;
  }
}

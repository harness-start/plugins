import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import { CHAIN_V2_PREFIX, SEAL_PREFIX, appendChainV2, sealReport, verifyReport } from "./report-integrity.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const WEEK = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u;

export type ReportPathOptions = {
  kind: string;
  home?: string | undefined;
  date?: string | undefined;
  week?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

export type SaveReportOptions = ReportPathOptions & {
  input: string;
};

export type SaveReportContentOptions = ReportPathOptions & {
  body: string;
  ledger?: unknown | undefined;
};

export type AppendReportOptions = {
  report?: string | undefined;
  input: string;
  home?: string | undefined;
  now?: string | number | Date | undefined;
};

function requireDate(value: unknown, label: string): string {
  const text = String(value ?? "");
  if (!DATE.test(text)) throw new Error(`${label} expects YYYY-MM-DD`);
  const [year, month, day] = text.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`${label} expects YYYY-MM-DD`);
  }
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error(`${label} is not a valid date`);
  }
  return text;
}

function reportsHome(home?: string | undefined): string {
  return resolve(home ?? process.env.HOME ?? homedir(), ".ai-experts");
}

function errorCode(error: unknown): unknown {
  return isRecord(error) ? error.code : undefined;
}

function errorMessage(error: unknown): string {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}

export function reportPath(options: ReportPathOptions): string {
  const home = options.home ?? process.env.HOME ?? homedir();
  if (options.kind === "daily") {
    const date = requireDate(options.date, "--date");
    return join(reportsHome(home), "daily-reports", `${date}.md`);
  }
  if (options.kind === "weekly") {
    const week = String(options.week ?? "");
    if (!WEEK.test(week)) throw new Error("--week expects YYYY-Www");
    return join(reportsHome(home), "weekly-reports", `${week}.md`);
  }
  if (options.kind === "summary") {
    const from = requireDate(options.from, "--from");
    const to = requireDate(options.to, "--to");
    if (from > to) throw new Error("--from must not be after --to");
    return join(reportsHome(home), "work-summary-reports", `${from}_to_${to}.md`);
  }
  throw new Error(`unknown report kind: ${String(options.kind)}`);
}

export function isProtectedReportPath(candidate: string, home?: string | undefined): boolean {
  const root = reportsHome(home);
  const absolute = resolve(candidate);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== absolute) return false;
  const parts = rel.split(sep);
  const folder = parts[0];
  const file = parts[1];
  return parts.length === 2 && Boolean(folder?.endsWith("-reports")) && Boolean(file);
}

async function rejectSymlink(path: string): Promise<void> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`refusing symbolic-link report path: ${path}`);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

async function prepareReportDirectory(path: string): Promise<void> {
  const reportDirectory = dirname(path);
  const expertsDirectory = dirname(reportDirectory);
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await prepareReportDirectory(path);
  await rejectSymlink(path);
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readUtf8(path: string, label: string): Promise<string> {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    throw new Error(`${label} cannot be read: ${errorMessage(error)}`);
  }
}

export async function saveReport(options: SaveReportOptions): Promise<{
  path: string;
  digest: string | undefined;
  bytes: number;
}> {
  const body = await readUtf8(options.input, "report input");
  return saveReportContent({ ...options, body });
}

export async function saveReportContent(options: SaveReportContentOptions): Promise<{
  path: string;
  digest: string | undefined;
  bytes: number;
  ledgerPath?: string | undefined;
}> {
  const target = reportPath(options);
  const body = options.body;
  if (!body.trim()) throw new Error("report body is empty");
  if (body.includes(SEAL_PREFIX)) throw new Error("report body contains a reserved seal marker");
  const normalized = body.endsWith("\n") ? body : `${body}\n`;

  try {
    const existing = await readFile(target, "utf8");
    const checked = verifyReport(existing);
    if (checked.ok) throw new Error(`report is already sealed: ${target}`);
    if (checked.kind !== "unsealed") throw new Error(`existing report integrity is invalid: ${checked.reason}`);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }

  const sealed = sealReport(normalized);
  await atomicWrite(target, sealed);
  let ledgerPath: string | undefined;
  if (options.ledger !== undefined) {
    ledgerPath = `${target}.ledger.json`;
    await atomicWrite(ledgerPath, `${JSON.stringify(options.ledger, null, 2)}\n`);
  }
  const verified = verifyReport(sealed);
  return { path: target, digest: verified.ok ? verified.digest : undefined, bytes: Buffer.byteLength(sealed), ...(ledgerPath ? { ledgerPath } : {}) };
}

export async function appendReport(options: AppendReportOptions): Promise<{
  path: string;
  digest: string;
  appendedBytes: number;
}> {
  const target = resolve(options.report ?? "");
  if (!isProtectedReportPath(target, options.home)) throw new Error("--report must target ~/.ai-experts/*-reports/*");
  await rejectSymlink(target);
  const before = await readUtf8(target, "sealed report");
  const checked = verifyReport(before);
  if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
  const addition = await readUtf8(options.input, "addition input");
  if (!addition.trim()) throw new Error("addition is empty");
  if (addition.includes(SEAL_PREFIX) || addition.includes(CHAIN_V2_PREFIX)) throw new Error("addition contains a reserved seal marker");
  const timestamp = new Date(options.now ?? Date.now()).toISOString();
  const block = `\n## Addition — ${timestamp}\n\n${addition.trimEnd()}\n`;
  await atomicWrite(target, appendChainV2(before, block));
  return { path: target, digest: checked.digest, appendedBytes: Buffer.byteLength(block) };
}

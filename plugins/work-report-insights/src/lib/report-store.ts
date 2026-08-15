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

import { SEAL_PREFIX, sealReport, verifyReport } from "./report-integrity.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const WEEK = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u;

function requireDate(value, label) {
  const text = String(value ?? "");
  if (!DATE.test(text)) throw new Error(`${label} expects YYYY-MM-DD`);
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error(`${label} is not a valid date`);
  }
  return text;
}

function reportsHome(home) {
  return resolve(home ?? process.env.HOME ?? homedir(), ".ai-experts");
}

export function reportPath(options) {
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

export function isProtectedReportPath(candidate, home) {
  const root = reportsHome(home);
  const absolute = resolve(candidate);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== absolute) return false;
  const parts = rel.split(sep);
  return parts.length === 2 && parts[0].endsWith("-reports") && Boolean(parts[1]);
}

async function rejectSymlink(path) {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`refusing symbolic-link report path: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function prepareReportDirectory(path) {
  const reportDirectory = dirname(path);
  const expertsDirectory = dirname(reportDirectory);
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
}

async function atomicWrite(path, content) {
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

async function readUtf8(path, label) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    throw new Error(`${label} cannot be read: ${error?.message ?? String(error)}`);
  }
}

export async function saveReport(options) {
  const target = reportPath(options);
  const body = await readUtf8(options.input, "report input");
  if (!body.trim()) throw new Error("report body is empty");
  if (body.includes(SEAL_PREFIX)) throw new Error("report body contains a reserved seal marker");
  const normalized = body.endsWith("\n") ? body : `${body}\n`;

  try {
    const existing = await readFile(target, "utf8");
    const checked = verifyReport(existing);
    if (checked.ok) throw new Error(`report is already sealed: ${target}`);
    if (checked.kind !== "unsealed") throw new Error(`existing report integrity is invalid: ${checked.reason}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const sealed = sealReport(normalized);
  await atomicWrite(target, sealed);
  return { path: target, digest: verifyReport(sealed).digest, bytes: Buffer.byteLength(sealed) };
}

export async function appendReport(options) {
  const target = resolve(options.report ?? "");
  if (!isProtectedReportPath(target, options.home)) throw new Error("--report must target ~/.ai-experts/*-reports/*");
  await rejectSymlink(target);
  const before = await readUtf8(target, "sealed report");
  const checked = verifyReport(before);
  if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
  const addition = await readUtf8(options.input, "addition input");
  if (!addition.trim()) throw new Error("addition is empty");
  if (addition.includes(SEAL_PREFIX)) throw new Error("addition contains a reserved seal marker");
  const timestamp = new Date(options.now ?? Date.now()).toISOString();
  const block = `\n## Addition — ${timestamp}\n\n${addition.trimEnd()}\n`;
  await atomicWrite(target, `${before}${block}`);
  return { path: target, digest: checked.digest, appendedBytes: Buffer.byteLength(block) };
}

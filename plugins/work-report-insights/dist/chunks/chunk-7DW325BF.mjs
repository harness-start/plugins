// harness-source-hash: sha256:732189012c5713973ec69794b790c4b7fa6094b07cc53261957e2fe6b257c901

// plugins/work-report-insights/src/lib/report-integrity.ts
import { createHash } from "node:crypto";
var SEAL_PREFIX = "<!-- work-report-insights:sha256:";
var SEAL_PATTERN = /^<!-- work-report-insights:sha256:([a-f0-9]{64}) -->$/gmu;
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function sealReport(body) {
  const bytes = String(body ?? "");
  if (bytes.includes(SEAL_PREFIX)) {
    throw new Error("report body contains a reserved seal marker");
  }
  if (!bytes.endsWith("\n")) {
    throw new Error("report body must end with a newline");
  }
  return `${bytes}${SEAL_PREFIX}${sha256(bytes)} -->
`;
}
function verifyReport(content) {
  const text = String(content ?? "");
  const matches = [...text.matchAll(SEAL_PATTERN)];
  if (matches.length === 0) {
    if (text.includes(SEAL_PREFIX)) {
      return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
    }
    return { ok: false, kind: "unsealed", reason: "seal marker is missing" };
  }
  if (matches.length !== 1) {
    return { ok: false, kind: "malformed", reason: "report must contain exactly one seal marker" };
  }
  const marker = matches[0];
  const body = text.slice(0, marker.index);
  const digest = marker[1];
  const suffix = text.slice(marker.index + marker[0].length);
  if (suffix.includes(SEAL_PREFIX)) {
    return { ok: false, kind: "malformed", reason: "report suffix contains a reserved seal marker" };
  }
  if (sha256(body) !== digest) {
    return { ok: false, kind: "mismatch", reason: "report body SHA-256 does not match the seal" };
  }
  return { ok: true, body, digest, suffix };
}

// plugins/work-report-insights/src/lib/report-store.ts
import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
var DATE = /^\d{4}-\d{2}-\d{2}$/u;
var WEEK = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u;
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
function reportPath(options) {
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
function isProtectedReportPath(candidate, home) {
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
  await mkdir(reportDirectory, { recursive: true, mode: 448 });
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
}
async function atomicWrite(path, content) {
  await prepareReportDirectory(path);
  await rejectSymlink(path);
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 384, flag: "wx" });
    await rename(temporary, path);
    await chmod(path, 384);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {
    });
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
async function saveReport(options) {
  const target = reportPath(options);
  const body = await readUtf8(options.input, "report input");
  if (!body.trim()) throw new Error("report body is empty");
  if (body.includes(SEAL_PREFIX)) throw new Error("report body contains a reserved seal marker");
  const normalized = body.endsWith("\n") ? body : `${body}
`;
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
async function appendReport(options) {
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
  const block = `
## Addition \u2014 ${timestamp}

${addition.trimEnd()}
`;
  await atomicWrite(target, `${before}${block}`);
  return { path: target, digest: checked.digest, appendedBytes: Buffer.byteLength(block) };
}

// plugins/work-report-insights/src/lib/report-cli.ts
import { readFile as readFile2 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { resolve as resolve2 } from "node:path";

// plugins/work-report-insights/src/lib/transcript-scan.ts
import { open, readdir, stat } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { basename as basename2, join as join2 } from "node:path";
var DATE2 = /^(\d{4})-(\d{2})-(\d{2})$/u;
var WEEK2 = /^(\d{4})-W(\d{2})$/u;
var MAX_LINES_PER_FILE = 2e4;
var MAX_FILE_BYTES = 8 * 1024 * 1024;
var MAX_SNIPPET = 280;
function localDay(value, label) {
  const match = DATE2.exec(String(value ?? ""));
  if (!match) throw new Error(`${label} expects YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${label} is not a valid date`);
  }
  return date;
}
function endOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
}
function isoWeekStart(value) {
  const match = WEEK2.exec(String(value ?? ""));
  if (!match) throw new Error("--week expects YYYY-Www");
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw new Error("--week is outside the ISO week range");
  const fourth = new Date(year, 0, 4);
  const day = fourth.getDay() || 7;
  const monday = new Date(year, 0, 4 - day + 1 + (week - 1) * 7);
  const probe = new Date(monday);
  probe.setDate(probe.getDate() + 3);
  if (probe.getFullYear() !== year) throw new Error("--week is not valid for its ISO year");
  return monday;
}
function buildReportWindow(options) {
  if (options.kind === "daily") {
    const start = localDay(options.date, "--date");
    return { label: options.date, startMs: start.getTime(), endMs: endOfLocalDay(start) };
  }
  if (options.kind === "weekly") {
    const start = isoWeekStart(options.week);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime() - 1;
    return { label: options.week, startMs: start.getTime(), endMs: end };
  }
  if (options.kind === "summary") {
    const start = localDay(options.from, "--from");
    const end = localDay(options.to, "--to");
    if (start.getTime() > end.getTime()) throw new Error("--from must not be after --to");
    return { label: `${options.from}_to_${options.to}`, startMs: start.getTime(), endMs: endOfLocalDay(end) };
  }
  throw new Error(`unknown report kind: ${String(options.kind)}`);
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function sanitizeSnippet(value, home = homedir2()) {
  let text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, " ");
  text = text.replace(/\bAuthorization:\s*Bearer\s+[^\s,;]+/giu, "Authorization: Bearer [REDACTED]");
  text = text.replace(/\b(?:token|api[_-]?key|secret|password)\s*[=:]\s*[^\s,;]+/giu, (match) => `${match.split(/[=:]/u)[0].trim()}=[REDACTED]`);
  if (home) text = text.replace(new RegExp(`${escapeRegExp(home)}(?:[\\\\/]\\S*)?`, "gu"), "~/.ai-experts-path");
  text = text.replace(/\s+/gu, " ").trim();
  return text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET - 1)}\u2026` : text;
}
async function discover(root, matches) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join2(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && matches(entry.name)) {
        try {
          const details = await stat(path);
          files.push({ path, size: details.size, mtimeMs: details.mtimeMs });
        } catch {
        }
      }
    }
  }
  return files;
}
function eventTimestamp(value) {
  for (const candidate of [value?.timestamp, value?.created_at, value?.createdAt, value?.time, value?.payload?.timestamp]) {
    const millis = typeof candidate === "number" ? candidate < 1e12 ? candidate * 1e3 : candidate : Date.parse(candidate ?? "");
    if (Number.isFinite(millis)) return millis;
  }
  return null;
}
function collectText(value, out = [], depth = 0) {
  if (depth > 7 || value == null) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    if (/encrypted|reasoning_content|signature/iu.test(key)) continue;
    if (typeof child === "string" && /^(?:text|content|message|prompt|output_text|input_text)$/u.test(key)) out.push(child);
    else if (typeof child === "object") collectText(child, out, depth + 1);
  }
  return out;
}
function collectTools(value, out = [], depth = 0) {
  if (depth > 7 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTools(item, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  const type = String(value.type ?? "");
  const name = value.name ?? value.tool_name ?? value.function?.name;
  if (typeof name === "string" && /tool|function_call/iu.test(type)) out.push(name);
  for (const child of Object.values(value)) {
    if (typeof child === "object") collectTools(child, out, depth + 1);
  }
  return out;
}
function inferRole(value) {
  return value?.role ?? value?.message?.role ?? value?.payload?.role ?? null;
}
function sessionId(value, fallback) {
  return String(value?.sessionId ?? value?.session_id ?? value?.session?.id ?? fallback);
}
async function scanFile(candidate, platform, window, home) {
  let raw;
  let byteTruncated = false;
  try {
    const handle = await open(candidate.path, "r");
    try {
      const bytes = Math.min(candidate.size, MAX_FILE_BYTES);
      const buffer = Buffer.alloc(bytes);
      const result = await handle.read(buffer, 0, bytes, 0);
      raw = buffer.subarray(0, result.bytesRead).toString("utf8");
      byteTruncated = candidate.size > result.bytesRead;
    } finally {
      await handle.close();
    }
  } catch {
    return { session: null, malformed: 0, unreadable: true, truncated: false };
  }
  const lines = raw.split(/\r?\n/u);
  const limited = lines.slice(0, MAX_LINES_PER_FILE);
  const evidence = [];
  const tools = [];
  const skills = /* @__PURE__ */ new Set();
  let malformed = 0;
  let firstAt = null;
  let lastAt = null;
  let id = basename2(candidate.path, ".jsonl");
  let project = null;
  for (let index = 0; index < limited.length; index += 1) {
    if (!limited[index].trim()) continue;
    let event;
    try {
      event = JSON.parse(limited[index]);
    } catch {
      malformed += 1;
      continue;
    }
    const timestamp = eventTimestamp(event);
    if (timestamp === null || timestamp < window.startMs || timestamp > window.endMs) continue;
    id = sessionId(event, id);
    const cwd = event.cwd ?? event.working_directory ?? event.payload?.cwd;
    if (typeof cwd === "string" && cwd) project = basename2(cwd);
    firstAt = firstAt === null ? timestamp : Math.min(firstAt, timestamp);
    lastAt = lastAt === null ? timestamp : Math.max(lastAt, timestamp);
    const text = sanitizeSnippet(collectText(event).join(" "), home);
    if (text) {
      for (const match of text.matchAll(/(?:^|\s)[$/]([a-z][a-z0-9-]{1,63})\b/giu)) skills.add(match[1].toLowerCase());
      evidence.push({ line: index + 1, role: inferRole(event), text });
    }
    for (const name of collectTools(event)) tools.push({ line: index + 1, id: sanitizeSnippet(name, home) });
  }
  if (firstAt === null) return { session: null, malformed, unreadable: false, truncated: byteTruncated || lines.length > limited.length };
  return {
    session: {
      platform,
      sessionId: id,
      project,
      firstEventAt: new Date(firstAt).toISOString(),
      lastEventAt: new Date(lastAt).toISOString(),
      evidence: evidence.slice(0, 40),
      tools: tools.slice(0, 40),
      skillsUsed: [...skills].sort()
    },
    malformed,
    unreadable: false,
    truncated: byteTruncated || lines.length > limited.length
  };
}
async function scanTranscripts(options) {
  const env = options.env ?? process.env;
  const home = env.HOME || homedir2();
  const platform = options.platform ?? "all";
  if (!(/* @__PURE__ */ new Set(["all", "claude", "codex"])).has(platform)) throw new Error("--platform expects claude, codex, or all");
  const maxSessions = options.maxSessions ?? 20;
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 200) throw new Error("--max-sessions expects an integer from 1 to 200");
  const roots = [];
  if (platform === "all" || platform === "claude") roots.push({ platform: "claude", path: join2(env.CLAUDE_CONFIG_DIR || join2(home, ".claude"), "projects"), matches: (name) => name.endsWith(".jsonl") });
  if (platform === "all" || platform === "codex") roots.push({ platform: "codex", path: join2(env.CODEX_HOME || join2(home, ".codex"), "sessions"), matches: (name) => name.endsWith(".jsonl") });
  const dataGaps = [];
  const candidates = [];
  for (const root of roots) {
    const discovered = await discover(root.path, root.matches);
    if (discovered.length === 0) dataGaps.push(`platform ${root.platform} has no readable transcript files`);
    for (const file of discovered) candidates.push({ ...file, platform: root.platform });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.size - left.size);
  const selected = candidates.slice(0, maxSessions);
  if (candidates.length > selected.length) dataGaps.push(`candidate transcripts ${candidates.length} exceed --max-sessions=${maxSessions}`);
  const sessions = [];
  let malformed = 0;
  let unreadable = 0;
  let truncated = 0;
  for (const candidate of selected) {
    const result = await scanFile(candidate, candidate.platform, options.window, home);
    if (result.session) sessions.push(result.session);
    malformed += result.malformed;
    if (result.unreadable) unreadable += 1;
    if (result.truncated) truncated += 1;
  }
  if (malformed > 0) dataGaps.push(`skipped ${malformed} malformed JSONL line(s)`);
  if (unreadable > 0) dataGaps.push(`skipped ${unreadable} unreadable transcript file(s)`);
  if (truncated > 0) dataGaps.push(`truncated ${truncated} transcript file(s) at ${MAX_LINES_PER_FILE} lines`);
  if (sessions.length === 0) dataGaps.push("report window contains no transcript evidence");
  sessions.sort((left, right) => right.lastEventAt.localeCompare(left.lastEventAt));
  return {
    window: { label: options.window.label, start: new Date(options.window.startMs).toISOString(), end: new Date(options.window.endMs).toISOString() },
    requested: { platform, maxSessions },
    overview: {
      sessionCount: sessions.length,
      claudeSessions: sessions.filter((session) => session.platform === "claude").length,
      codexSessions: sessions.filter((session) => session.platform === "codex").length,
      projectCount: new Set(sessions.map((session) => session.project).filter(Boolean)).size
    },
    sessions,
    dataGaps
  };
}
async function collectTranscriptActivity(options) {
  const window = buildReportWindow(options);
  const scanned = await scanTranscripts({ ...options, window });
  return {
    kind: options.kind,
    label: window.label,
    window: scanned.window,
    overview: scanned.overview,
    skillsUsed: [...new Set(scanned.sessions.flatMap((session) => session.skillsUsed))].sort(),
    toolsUsed: [...new Set(scanned.sessions.flatMap((session) => session.tools.map((tool) => tool.id)))].sort(),
    dataGaps: scanned.dataGaps
  };
}

// plugins/work-report-insights/src/lib/report-cli.ts
var ACTIONS = /* @__PURE__ */ new Set(["collect", "scan", "prepare", "save", "addition-prepare", "append", "verify"]);
function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (value == null || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}
function parseReportArgs(kind, action, argv) {
  if (!ACTIONS.has(action)) throw new Error(`unknown report action: ${action}`);
  const result = { platform: "all", maxSessions: 20, format: "json", skipGit: false, help: false };
  const stringFlags = /* @__PURE__ */ new Map([
    ["--date", "date"],
    ["--week", "week"],
    ["--from", "from"],
    ["--to", "to"],
    ["--input", "input"],
    ["--report", "report"],
    ["--platform", "platform"],
    ["--format", "format"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { ...result, help: true };
    if (arg === "--skip-git") {
      result.skipGit = true;
      continue;
    }
    if (arg === "--max-sessions") {
      result.maxSessions = Number.parseInt(valueAfter(argv, index, arg), 10);
      index += 1;
      continue;
    }
    const key = stringFlags.get(arg);
    if (key) {
      result[key] = valueAfter(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!(/* @__PURE__ */ new Set(["all", "claude", "codex"])).has(result.platform)) throw new Error("--platform expects claude, codex, or all");
  if (!(/* @__PURE__ */ new Set(["json", "markdown"])).has(result.format)) throw new Error("--format expects json or markdown");
  if (!Number.isInteger(result.maxSessions) || result.maxSessions < 1 || result.maxSessions > 200) throw new Error("--max-sessions expects an integer from 1 to 200");
  if (kind === "summary" && (!result.from || !result.to)) throw new Error("--from and --to are required");
  if ((/* @__PURE__ */ new Set(["prepare", "save", "addition-prepare", "append"])).has(action) && !result.input) throw new Error("--input is required");
  if ((/* @__PURE__ */ new Set(["addition-prepare", "append", "verify"])).has(action) && !result.report) throw new Error("--report is required");
  return result;
}
function periodOptions(kind, args, home) {
  return { kind, date: args.date, week: args.week, from: args.from, to: args.to, home };
}
function localDateLabel(now) {
  const date = new Date(now);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function isoWeekLabel(now) {
  const date = new Date(now);
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = thursday.getDay() || 7;
  thursday.setDate(thursday.getDate() + 4 - day);
  const year = thursday.getFullYear();
  const first = new Date(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - first.getTime()) / 864e5 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function applyPeriodDefaults(kind, args, now) {
  if (kind === "daily" && !args.date) return { ...args, date: localDateLabel(now) };
  if (kind === "weekly" && !args.week) return { ...args, week: isoWeekLabel(now) };
  return args;
}
function renderScanMarkdown(report) {
  const lines = [
    `# transcript scan \u2014 ${report.window.label}`,
    "",
    `- window: ${report.window.start} \u2192 ${report.window.end}`,
    `- sessions: ${report.overview.sessionCount}`
  ];
  for (const session of report.sessions) {
    lines.push("", `## [${session.platform}] ${session.sessionId}`);
    lines.push(`- project: ${session.project ?? "n/a"}`);
    for (const item of session.evidence) lines.push(`- L${item.line} ${item.role ?? "event"}: ${item.text}`);
  }
  if (report.dataGaps.length > 0) lines.push("", "## data gaps", ...report.dataGaps.map((gap) => `- ${gap}`));
  return lines.join("\n");
}
async function readCandidate(input) {
  const value = await readFile2(resolve2(input), "utf8");
  if (!value.trim()) throw new Error("candidate content is empty");
  if (value.includes(SEAL_PREFIX)) throw new Error("candidate content contains a reserved seal marker");
  return value.endsWith("\n") ? value : `${value}
`;
}
async function executeReportCommand({ kind, action, argv, env = process.env, now = Date.now() }) {
  const args = applyPeriodDefaults(kind, parseReportArgs(kind, action, argv), now);
  if (args.help) return { help: true, kind, action };
  const home = env.HOME || homedir3();
  const period = periodOptions(kind, args, home);
  if (action === "collect") return collectTranscriptActivity({ ...period, env, platform: args.platform, maxSessions: args.maxSessions });
  if (action === "scan") {
    const window = buildReportWindow(period);
    return scanTranscripts({ window, env, platform: args.platform, maxSessions: args.maxSessions });
  }
  if (action === "prepare") {
    const body = await readCandidate(args.input);
    return { kind, action, target: reportPath(period), candidateSha256: sha256(body), bytes: Buffer.byteLength(body) };
  }
  if (action === "save") return { kind, action, ...await saveReport({ ...period, input: args.input }) };
  if (action === "verify") {
    const content = await readFile2(resolve2(args.report), "utf8");
    const checked = verifyReport(content);
    return { kind: "report", action, path: resolve2(args.report), ...checked };
  }
  if (action === "addition-prepare") {
    const content = await readFile2(resolve2(args.report), "utf8");
    const checked = verifyReport(content);
    if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
    const addition = await readCandidate(args.input);
    return { kind: "report", action, path: resolve2(args.report), reportSha256: sha256(content), candidateSha256: sha256(addition), bytes: Buffer.byteLength(addition) };
  }
  if (action === "append") return { kind: "report", action, ...await appendReport({ report: args.report, input: args.input, home }) };
  throw new Error(`unsupported action: ${action}`);
}
function usage(kind, action) {
  const period = kind === "daily" ? "--date YYYY-MM-DD" : kind === "weekly" ? "--week YYYY-Www" : kind === "summary" ? "--from YYYY-MM-DD --to YYYY-MM-DD" : "--report PATH";
  const input = (/* @__PURE__ */ new Set(["prepare", "save", "addition-prepare", "append"])).has(action) ? " --input PATH" : "";
  return `Usage: ${kind}-${action} ${period}${input}`;
}
async function runCli(kind, action, argv = process.argv.slice(2), env = process.env) {
  try {
    const result = await executeReportCommand({ kind, action, argv, env });
    if (result.help) {
      process.stdout.write(`${usage(kind, action)}
`);
      return 0;
    }
    const formatIndex = argv.indexOf("--format");
    const format = formatIndex >= 0 ? argv[formatIndex + 1] : "json";
    if (action === "scan" && format === "markdown") process.stdout.write(`${renderScanMarkdown(result)}
`);
    else process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}
${usage(kind, action)}
`);
    return 2;
  }
}

export {
  SEAL_PREFIX,
  sha256,
  verifyReport,
  reportPath,
  isProtectedReportPath,
  parseReportArgs,
  runCli
};

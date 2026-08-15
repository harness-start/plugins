import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { isRecord } from "@harness/core/hook-event";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const WEEK = /^(\d{4})-W(\d{2})$/u;
const MAX_LINES_PER_FILE = 20_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SNIPPET = 280;

export type ReportWindow = {
  label: string;
  startMs: number;
  endMs: number;
};

export type BuildWindowOptions = {
  kind: string;
  date?: string | undefined;
  week?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

export type TranscriptEvidence = {
  line: number;
  role: unknown;
  text: string;
};

export type TranscriptTool = {
  line: number;
  id: string;
};

export type TranscriptSession = {
  platform: string;
  sessionId: string;
  project: string | null;
  firstEventAt: string;
  lastEventAt: string;
  evidence: TranscriptEvidence[];
  tools: TranscriptTool[];
  skillsUsed: string[];
};

export type TranscriptScanReport = {
  window: { label: string; start: string; end: string };
  requested: { platform: string; maxSessions: number };
  overview: {
    sessionCount: number;
    claudeSessions: number;
    codexSessions: number;
    projectCount: number;
  };
  sessions: TranscriptSession[];
  dataGaps: string[];
};

export type ScanTranscriptOptions = {
  window: ReportWindow;
  env?: NodeJS.ProcessEnv | undefined;
  platform?: string | undefined;
  maxSessions?: number | undefined;
};

export type CollectActivityOptions = BuildWindowOptions & {
  env?: NodeJS.ProcessEnv | undefined;
  platform?: string | undefined;
  maxSessions?: number | undefined;
};

type TranscriptFile = {
  path: string;
  size: number;
  mtimeMs: number;
};

function localDay(value: unknown, label: string): Date {
  const match = DATE.exec(String(value ?? ""));
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

function endOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
}

function isoWeekStart(value: unknown): Date {
  const match = WEEK.exec(String(value ?? ""));
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

export function buildReportWindow(options: BuildWindowOptions): ReportWindow {
  if (options.kind === "daily") {
    const start = localDay(options.date, "--date");
    return { label: String(options.date), startMs: start.getTime(), endMs: endOfLocalDay(start) };
  }
  if (options.kind === "weekly") {
    const start = isoWeekStart(options.week);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime() - 1;
    return { label: String(options.week), startMs: start.getTime(), endMs: end };
  }
  if (options.kind === "summary") {
    const start = localDay(options.from, "--from");
    const end = localDay(options.to, "--to");
    if (start.getTime() > end.getTime()) throw new Error("--from must not be after --to");
    return { label: `${options.from}_to_${options.to}`, startMs: start.getTime(), endMs: endOfLocalDay(end) };
  }
  throw new Error(`unknown report kind: ${String(options.kind)}`);
}

function escapeRegExp(value: unknown): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function sanitizeSnippet(value: unknown, home = homedir()): string {
  let text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, " ");
  text = text.replace(/\bAuthorization:\s*Bearer\s+[^\s,;]+/giu, "Authorization: Bearer [REDACTED]");
  text = text.replace(/\b(?:token|api[_-]?key|secret|password)\s*[=:]\s*[^\s,;]+/giu, (match) => `${match.split(/[=:]/u)[0]?.trim()}=[REDACTED]`);
  if (home) text = text.replace(new RegExp(`${escapeRegExp(home)}(?:[\\\\/]\\S*)?`, "gu"), "~/.ai-experts-path");
  text = text.replace(/\s+/gu, " ").trim();
  return text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET - 1)}…` : text;
}

async function discover(root: string, matches: (name: string) => boolean): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && matches(entry.name)) {
        try {
          const details = await stat(path);
          files.push({ path, size: details.size, mtimeMs: details.mtimeMs });
        } catch {
          // The session may disappear while old transcripts are being pruned.
        }
      }
    }
  }
  return files;
}

function eventTimestamp(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const payload = isRecord(value.payload) ? value.payload : undefined;
  for (const candidate of [value.timestamp, value.created_at, value.createdAt, value.time, payload?.timestamp]) {
    const millis = typeof candidate === "number"
      ? (candidate < 1_000_000_000_000 ? candidate * 1000 : candidate)
      : Date.parse(typeof candidate === "string" ? candidate : String(candidate ?? ""));
    if (Number.isFinite(millis)) return millis;
  }
  return null;
}

function collectText(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 7 || value == null) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1);
    return out;
  }
  if (!isRecord(value)) return out;
  for (const [key, child] of Object.entries(value)) {
    if (/encrypted|reasoning_content|signature/iu.test(key)) continue;
    if (typeof child === "string" && /^(?:text|content|message|prompt|output_text|input_text)$/u.test(key)) out.push(child);
    else if (typeof child === "object") collectText(child, out, depth + 1);
  }
  return out;
}

function collectTools(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 7 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTools(item, out, depth + 1);
    return out;
  }
  if (!isRecord(value)) return out;
  const type = String(value.type ?? "");
  const fn = isRecord(value.function) ? value.function : undefined;
  const name = value.name ?? value.tool_name ?? fn?.name;
  if (typeof name === "string" && /tool|function_call/iu.test(type)) out.push(name);
  for (const child of Object.values(value)) {
    if (typeof child === "object") collectTools(child, out, depth + 1);
  }
  return out;
}

function inferRole(value: unknown): unknown {
  if (!isRecord(value)) return null;
  const message = isRecord(value.message) ? value.message : undefined;
  const payload = isRecord(value.payload) ? value.payload : undefined;
  return value.role ?? message?.role ?? payload?.role ?? null;
}

function sessionId(value: unknown, fallback: string): string {
  if (!isRecord(value)) return String(fallback);
  const session = isRecord(value.session) ? value.session : undefined;
  return String(value.sessionId ?? value.session_id ?? session?.id ?? fallback);
}

async function scanFile(
  candidate: TranscriptFile,
  platform: string,
  window: ReportWindow,
  home: string,
): Promise<{ session: TranscriptSession | null; malformed: number; unreadable: boolean; truncated: boolean }> {
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
  const evidence: TranscriptEvidence[] = [];
  const tools: TranscriptTool[] = [];
  const skills = new Set<string>();
  let malformed = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  let id = basename(candidate.path, ".jsonl");
  let project: string | null = null;

  for (let index = 0; index < limited.length; index += 1) {
    const line = limited[index];
    if (line === undefined || !line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    const timestamp = eventTimestamp(event);
    if (timestamp === null || timestamp < window.startMs || timestamp > window.endMs) continue;
    id = sessionId(event, id);
    const record = isRecord(event) ? event : undefined;
    const payload = record && isRecord(record.payload) ? record.payload : undefined;
    const cwd = record?.cwd ?? record?.working_directory ?? payload?.cwd;
    if (typeof cwd === "string" && cwd) project = basename(cwd);
    firstAt = firstAt === null ? timestamp : Math.min(firstAt, timestamp);
    lastAt = lastAt === null ? timestamp : Math.max(lastAt, timestamp);
    const text = sanitizeSnippet(collectText(event).join(" "), home);
    if (text) {
      for (const match of text.matchAll(/(?:^|\s)[$/]([a-z][a-z0-9-]{1,63})\b/giu)) {
        const skill = match[1];
        if (skill) skills.add(skill.toLowerCase());
      }
      evidence.push({ line: index + 1, role: inferRole(event), text });
    }
    for (const name of collectTools(event)) tools.push({ line: index + 1, id: sanitizeSnippet(name, home) });
  }

  if (firstAt === null || lastAt === null) return { session: null, malformed, unreadable: false, truncated: byteTruncated || lines.length > limited.length };
  return {
    session: {
      platform,
      sessionId: id,
      project,
      firstEventAt: new Date(firstAt).toISOString(),
      lastEventAt: new Date(lastAt).toISOString(),
      evidence: evidence.slice(0, 40),
      tools: tools.slice(0, 40),
      skillsUsed: [...skills].sort(),
    },
    malformed,
    unreadable: false,
    truncated: byteTruncated || lines.length > limited.length,
  };
}

export async function scanTranscripts(options: ScanTranscriptOptions): Promise<TranscriptScanReport> {
  const env = options.env ?? process.env;
  const home = env.HOME || homedir();
  const platform = options.platform ?? "all";
  if (platform !== "all" && platform !== "claude" && platform !== "codex") throw new Error("--platform expects claude, codex, or all");
  const maxSessions = options.maxSessions ?? 20;
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 200) throw new Error("--max-sessions expects an integer from 1 to 200");
  const roots: Array<{ platform: "claude" | "codex"; path: string; matches: (name: string) => boolean }> = [];
  if (platform === "all" || platform === "claude") roots.push({ platform: "claude", path: join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects"), matches: (name) => name.endsWith(".jsonl") });
  if (platform === "all" || platform === "codex") roots.push({ platform: "codex", path: join(env.CODEX_HOME || join(home, ".codex"), "sessions"), matches: (name) => name.endsWith(".jsonl") });

  const dataGaps: string[] = [];
  const candidates: Array<TranscriptFile & { platform: "claude" | "codex" }> = [];
  for (const root of roots) {
    const discovered = await discover(root.path, root.matches);
    if (discovered.length === 0) dataGaps.push(`platform ${root.platform} has no readable transcript files`);
    for (const file of discovered) candidates.push({ ...file, platform: root.platform });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.size - left.size);
  const selected = candidates.slice(0, maxSessions);
  if (candidates.length > selected.length) dataGaps.push(`candidate transcripts ${candidates.length} exceed --max-sessions=${maxSessions}`);

  const sessions: TranscriptSession[] = [];
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
      projectCount: new Set(sessions.map((session) => session.project).filter(Boolean)).size,
    },
    sessions,
    dataGaps,
  };
}

export async function collectTranscriptActivity(options: CollectActivityOptions): Promise<{
  kind: string;
  label: string;
  window: TranscriptScanReport["window"];
  overview: TranscriptScanReport["overview"];
  skillsUsed: string[];
  toolsUsed: string[];
  dataGaps: string[];
}> {
  const window = buildReportWindow(options);
  const scanned = await scanTranscripts({ ...options, window });
  return {
    kind: options.kind,
    label: window.label,
    window: scanned.window,
    overview: scanned.overview,
    skillsUsed: [...new Set(scanned.sessions.flatMap((session) => session.skillsUsed))].sort(),
    toolsUsed: [...new Set(scanned.sessions.flatMap((session) => session.tools.map((tool) => tool.id)))].sort(),
    dataGaps: scanned.dataGaps,
  };
}

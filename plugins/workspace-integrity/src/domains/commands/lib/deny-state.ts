import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";

import { tokenizeShell } from "./shell-parse.js";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_THRESHOLD = 3;
export const STATE_DIR_RELATIVE = ".command-safety/.state";

export type EscalationOptions = {
  windowMinutes?: number | undefined;
  threshold?: number | undefined;
};

type DenyEntry = {
  ts: number;
  target?: unknown;
  turn?: unknown;
};

function eventCwd(event: HookEvent): string {
  return typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
}

function stateFile(cwd: string): string {
  return join(resolve(cwd), STATE_DIR_RELATIVE, "denies.jsonl");
}

function ensureStateFile(event: HookEvent): string | null {
  const cwd = eventCwd(event);
  const path = stateFile(cwd);
  try {
    const directory = join(resolve(cwd), STATE_DIR_RELATIVE);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    ensurePluginWorkdirGitignore(join(resolve(cwd), ".command-safety"));
    return path;
  } catch {
    return null;
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function target(event: HookEvent, command: string): string {
  const cwd = eventCwd(event);
  const tool = isRecord(event.tool) ? event.tool : null;
  const input = tool && isRecord(tool.input) ? tool.input : null;
  const fileTargets = tool && Array.isArray(tool.fileTargets) ? tool.fileTargets : null;
  const direct =
    input?.file_path ??
    input?.filePath ??
    input?.path ??
    fileTargets?.[0];
  if (direct) return hash(resolve(cwd, String(direct)));
  const tokens = tokenizeShell(command).filter(
    (token) => ![";", "&&", "||", "|", "&"].includes(token),
  );
  const operation =
    tokens
      .find((token) =>
        /^(?:rm|sed|cat|mysql|mysqlsh|redis-cli|nmap|masscan|zmap|ffuf|gobuster|feroxbuster)$/u.test(
          token.split("/").at(-1) ?? "",
        ),
      )
      ?.split("/")
      .at(-1) ??
    tokens[0] ??
    "command";
  const path = [...tokens]
    .reverse()
    .find(
      (token) =>
        !token.startsWith("-") &&
        (/^(?:\/|\.|~|\$)/u.test(token) || token.includes("/")),
    );
  return hash(`${operation}:${path ?? tokens[1] ?? ""}`);
}

function isDenyEntry(value: unknown): value is DenyEntry {
  return isRecord(value) && typeof value.ts === "number";
}

function entries(event: HookEvent): DenyEntry[] {
  const path = stateFile(eventCwd(event));
  if (!path) return [];
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parsed: unknown = JSON.parse(line);
        return parsed;
      })
      .filter(isDenyEntry);
  } catch {
    return [];
  }
}

export function escalationMessage(
  event: HookEvent,
  command: string,
  options: EscalationOptions = {},
): string | null {
  if (/(?:^|\s)#\s*escalation-ok\b/iu.test(command)) return null;
  const windowMs =
    typeof options.windowMinutes === "number" && options.windowMinutes > 0
      ? options.windowMinutes * 60 * 1000
      : DEFAULT_WINDOW_MS;
  const threshold =
    typeof options.threshold === "number" && options.threshold > 0
      ? options.threshold
      : DEFAULT_THRESHOLD;
  const key = target(event, command);
  const cutoff = Date.now() - windowMs;
  const currentTurn = event.turn_id ?? event.turnId ?? "";
  const recent = entries(event).filter(
    (entry) =>
      entry.ts >= cutoff &&
      entry.target === key &&
      (!currentTurn || entry.turn !== currentTurn),
  );
  const turns = new Set(recent.map((entry) => entry.turn).filter(Boolean));
  const count = Math.max(
    turns.size,
    recent.filter((entry) => !entry.turn).length,
  );
  return count >= threshold
    ? `[Deny Escalation Guard] command-safety has denied the same target ${count} times.\n\nStop retrying with alternate spellings, reread the denial reason, and satisfy its prerequisites. If this is a false positive, explain the evidence to the user. The count expires after ${options.windowMinutes ?? 10} minutes.`
    : null;
}

export function recordDeny(event: HookEvent, command: string, hook: string): void {
  const path = ensureStateFile(event);
  if (!path) return;
  try {
    appendFileSync(
      path,
      `${JSON.stringify({
        ts: Date.now(),
        turn: event.turn_id ?? event.turnId ?? "",
        target: target(event, command),
        hook,
      })}\n`,
      { mode: 0o600 },
    );
  } catch {
    // State write failure must not block the deny decision.
  }
}

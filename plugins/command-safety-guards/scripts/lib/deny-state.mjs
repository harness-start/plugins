import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tokenizeShell } from "./shell-parse.mjs";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_THRESHOLD = 3;

function root() {
  return process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || null;
}

function file() {
  const dir = root();
  if (!dir) return null;
  return resolve(dir, "command-safety-denies.jsonl");
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function target(event, command) {
  const cwd = event?.cwd || process.cwd();
  const direct =
    event?.tool?.input?.file_path ??
    event?.tool?.input?.filePath ??
    event?.tool?.input?.path ??
    event?.tool?.fileTargets?.[0];
  if (direct) return hash(resolve(cwd, String(direct)));
  const tokens = tokenizeShell(command).filter(
    (token) => ![";", "&&", "||", "|", "&"].includes(token),
  );
  const operation =
    tokens
      .find((token) =>
        /^(?:rm|sed|cat|mysql|mysqlsh|redis-cli|nmap|masscan|zmap|ffuf|gobuster|feroxbuster)$/u.test(
          token.split("/").at(-1),
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

function entries() {
  const path = file();
  if (!path) return [];
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * @param {object} event
 * @param {string} command
 * @param {{ windowMinutes?: number, threshold?: number }} [options]
 */
export function escalationMessage(event, command, options = {}) {
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
  const currentTurn = event?.turn_id ?? event?.turnId ?? "";
  const recent = entries().filter(
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
    ? `[Deny Escalation Guard] command-safety-guards has denied the same target ${count} times.\n\nStop retrying with alternate spellings, reread the denial reason, and satisfy its prerequisites. If this is a false positive, explain the evidence to the user. The count expires after ${options.windowMinutes ?? 10} minutes.`
    : null;
}

export function recordDeny(event, command, hook) {
  const path = file();
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(
      path,
      `${JSON.stringify({
        ts: Date.now(),
        turn: event?.turn_id ?? event?.turnId ?? "",
        target: target(event, command),
        hook,
      })}\n`,
      { mode: 0o600 },
    );
  } catch {
    // State write failure must not block the deny decision.
  }
}

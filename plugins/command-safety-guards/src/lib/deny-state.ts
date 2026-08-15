import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tokenizeShell } from "./shell-parse.js";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_THRESHOLD = 3;
export const STATE_DIR_RELATIVE = ".command-safety-guards/.state";

function stateFile(cwd) {
  return join(resolve(cwd), STATE_DIR_RELATIVE, "denies.jsonl");
}

function ensureStateFile(event) {
  const cwd = event?.cwd || process.cwd();
  const path = stateFile(cwd);
  try {
    const directory = join(resolve(cwd), STATE_DIR_RELATIVE);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const ignore = join(directory, ".gitignore");
    if (!existsSync(ignore)) {
      writeFileSync(ignore, "*\n", { encoding: "utf8", mode: 0o600 });
    }
    return path;
  } catch {
    return null;
  }
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

function entries(event) {
  const path = stateFile(event?.cwd || process.cwd());
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
    ? `[Deny Escalation Guard] command-safety-guards has denied the same target ${count} times.\n\nStop retrying with alternate spellings, reread the denial reason, and satisfy its prerequisites. If this is a false positive, explain the evidence to the user. The count expires after ${options.windowMinutes ?? 10} minutes.`
    : null;
}

export function recordDeny(event, command, hook) {
  const path = ensureStateFile(event);
  if (!path) return;
  try {
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

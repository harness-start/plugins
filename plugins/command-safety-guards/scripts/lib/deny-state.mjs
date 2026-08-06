import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tokenizeShell } from "./shell-parse.mjs";

const WINDOW = 10 * 60 * 1000, THRESHOLD = 3;
function root() { return process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || null; }
function file() { const dir = root(); if (!dir) return null; return resolve(dir, "command-safety-denies.jsonl"); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function target(event, command) {
  const cwd = event?.cwd || process.cwd(), direct = event?.tool?.input?.file_path ?? event?.tool?.input?.filePath ?? event?.tool?.input?.path ?? event?.tool?.fileTargets?.[0]; if (direct) return hash(resolve(cwd, String(direct)));
  const tokens = tokenizeShell(command).filter((token) => ![";", "&&", "||", "|", "&"].includes(token)); const operation = tokens.find((token) => /^(?:rm|sed|cat|mysql|mysqlsh|redis-cli|nmap|masscan|zmap|ffuf|gobuster|feroxbuster)$/u.test(token.split("/").at(-1)))?.split("/").at(-1) ?? tokens[0] ?? "command"; const path = [...tokens].reverse().find((token) => !token.startsWith("-") && (/^(?:\/|\.|~|\$)/u.test(token) || token.includes("/"))); return hash(`${operation}:${path ?? tokens[1] ?? ""}`);
}
function entries() { const path = file(); if (!path) return []; try { return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; } }
export function escalationMessage(event, command) { if (/(?:^|\s)#\s*escalation-ok\b/iu.test(command)) return null; const key = target(event, command), cutoff = Date.now() - WINDOW, currentTurn = event?.turn_id ?? event?.turnId ?? ""; const recent = entries().filter((entry) => entry.ts >= cutoff && entry.target === key && (!currentTurn || entry.turn !== currentTurn)); const turns = new Set(recent.map((entry) => entry.turn).filter(Boolean)); const count = Math.max(turns.size, recent.filter((entry) => !entry.turn).length); return count >= THRESHOLD ? `[Deny Escalation Guard] 同一目标已被 command-safety-guards deny ${count} 次。\n\n请停止变换写法重试，重读拦截原因并解决前置条件；确认误伤时向用户说明证据。10 分钟后计数失效。` : null; }
export function recordDeny(event, command, hook) { const path = file(); if (!path) return; try { mkdirSync(dirname(path), { recursive: true }); appendFileSync(path, `${JSON.stringify({ ts: Date.now(), turn: event?.turn_id ?? event?.turnId ?? "", target: target(event, command), hook })}\n`, { mode: 0o600 }); } catch {} }

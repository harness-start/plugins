import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { commandExists, combinedOutput, runCommand } from "../lib/process-utils.mjs";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRY = 30 * 60 * 1000;
const HEAVY = /\b(?:phpunit|phpstan|pest|psalm)\b/iu;
const BYPASS = /(^|\s)#\s*retry-ok\b/iu;

function dataPath() { const root = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA; return root ? join(root, "php-runtime-guards", "runtime-state.json") : null; }
function load() { const path = dataPath(); if (!path) return { cooldowns: {}, heavy: {}, phpstan: {} }; try { return { cooldowns: {}, heavy: {}, phpstan: {}, ...JSON.parse(readFileSync(path, "utf8")) }; } catch { return { cooldowns: {}, heavy: {}, phpstan: {} }; } }
function save(state) { const path = dataPath(); if (!path) return false; try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8"); return true; } catch { return false; } }
function sessionKey(event) { return `${event?.session_id ?? event?.sessionId ?? "no-session"}:${event?.cwd ?? process.cwd()}`; }
function findUp(name, from) { let current = resolve(from), root = parse(current).root; while (true) { const candidate = join(current, name); if (existsSync(candidate)) return candidate; if (current === root) return null; current = dirname(current); } }
function commandOf(event) { const input = event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? {}; return String(input.command ?? input.cmd ?? ""); }
function normalize(command) { let value = command.replace(/\s+#\s*retry-ok\b.*$/iu, "").replace(/\s+2>&1/gu, " ").trim(); while (/\s*\|\s*(?:tail|head|less|more|tee|cat)\b[^|]*$/iu.test(value)) value = value.replace(/\s*\|\s*(?:tail|head|less|more|tee|cat)\b[^|]*$/iu, "").trim(); return value.replace(/\s+/gu, " ").replace(/;+$/u, ""); }
function heavyId(key, command) { return createHash("sha256").update(`${key}\0${command}`).digest("hex"); }

export function environmentContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd(), composerPath = findUp("composer.json", cwd);
  if (!composerPath) return null;
  const state = load(), cooldown = `env:${composerPath}`;
  if (Date.now() - Number(state.cooldowns[cooldown] ?? 0) < DAY) return null;
  let composer; try { composer = JSON.parse(readFileSync(composerPath, "utf8")); } catch { return null; }
  const facts = [];
  if (composer.name) facts.push(`Project: ${composer.name}`);
  if (composer.require?.php) facts.push(`PHP constraint: ${composer.require.php}`);
  const req = composer.require ?? {};
  if (req["laravel/framework"]) facts.push(`Framework: Laravel ${req["laravel/framework"]}`); else if (req["symfony/framework-bundle"]) facts.push(`Framework: Symfony ${req["symfony/framework-bundle"]}`); else if (req["slim/slim"]) facts.push(`Framework: Slim ${req["slim/slim"]}`);
  if (existsSync(join(dirname(composerPath), "composer.lock"))) facts.push("composer.lock: present");
  const namespaces = Object.keys(composer.autoload?.["psr-4"] ?? {}); if (namespaces.length) facts.push(`PSR-4: ${namespaces.slice(0, 3).join(", ")}`);
  if (!facts.length) return null;
  state.cooldowns[cooldown] = Date.now(); save(state);
  return ["[PHP Env]", ...facts.map((fact) => `  ${fact}`)].join("\n");
}

export function heavyCommandDecision(event) {
  const command = commandOf(event);
  if (!HEAVY.test(command) || BYPASS.test(command)) return null;
  const normalized = normalize(command), state = load(), id = heavyId(sessionKey(event), normalized), previous = state.heavy[id];
  if (!previous || Date.now() - previous.lastSeen > EXPIRY) return null;
  const next = previous.streak + 1, failure = previous.outcome === "failure";
  const reportAt = failure ? 3 : 6, denyAt = failure ? 5 : 12;
  if (next < reportAt) return null;
  const message = `[PHP Heavy Command] ${failure ? "failed" : "successful"} command would run for the ${next}th repeated time within 30 minutes:\n  ${normalized}\n${next >= denyAt ? "Inspect the prior full output and fix the root cause before retrying; append # retry-ok only for an intentional exception." : `${denyAt - next} more identical run(s) will be denied.`}`;
  return { action: next >= denyAt ? "deny" : "report", message };
}

export function recordHeavyCommandOutcome(event) {
  const command = commandOf(event), state = load(), key = sessionKey(event);
  if (!HEAVY.test(command)) return;
  if (BYPASS.test(command)) { for (const [id, item] of Object.entries(state.heavy)) if (item.sessionKey === key) delete state.heavy[id]; save(state); return; }
  const normalized = normalize(command), id = heavyId(key, normalized), response = event?.tool_response ?? event?.toolResponse ?? event?.tool?.response ?? {};
  const code = response.exit_code ?? response.exitCode ?? response.code ?? response.status; const outcome = code === undefined ? response.error ? "failure" : "success" : Number(code) === 0 ? "success" : "failure";
  const previous = state.heavy[id], now = Date.now();
  state.heavy[id] = previous && now - previous.lastSeen <= EXPIRY && previous.outcome === outcome ? { sessionKey: key, normalized, outcome, streak: previous.streak + 1, startedAt: previous.startedAt, lastSeen: now } : { sessionKey: key, normalized, outcome, streak: 1, startedAt: now, lastSeen: now };
  save(state);
}

export function trackPhpstanFile(event, filePath) {
  const target = isAbsolute(filePath) ? filePath : resolve(event?.cwd ?? process.cwd(), filePath);
  if (!target.toLowerCase().endsWith(".php") || !existsSync(target)) return;
  const state = load(), key = sessionKey(event), current = state.phpstan[key] ?? { paths: [], overflow: false, updatedAt: 0 };
  if (!current.paths.includes(target)) { if (current.paths.length >= 24) current.overflow = true; else current.paths.push(target); }
  current.updatedAt = Date.now(); state.phpstan[key] = current; save(state);
}

export async function phpstanStop(event) {
  const state = load(), key = sessionKey(event), current = state.phpstan[key];
  if (!current || Date.now() - current.updatedAt > DAY) return null;
  delete state.phpstan[key]; save(state);
  if (current.overflow) return { action: "report", message: "[PHPStan] More than 24 PHP files changed; run one bounded project analysis on an explicit directory." };
  const paths = current.paths.filter((path) => existsSync(path)); if (!paths.length) return null;
  const composer = findUp("composer.json", event?.cwd ?? process.cwd()), root = composer ? dirname(composer) : event?.cwd ?? process.cwd();
  const local = join(root, "vendor", "bin", process.platform === "win32" ? "phpstan.bat" : "phpstan");
  let command, args;
  if (existsSync(local)) { command = local; args = ["analyse", "--no-progress", "--error-format=json", ...paths]; }
  else if (commandExists("phpstan")) { command = "phpstan"; args = ["analyse", "--no-progress", "--error-format=json", ...paths]; }
  else return { action: "report", message: "[PHPStan] Changed PHP files were tracked, but no project-local or PATH PHPStan executable is available; no package was installed by the hook." };
  const result = await runCommand(command, args, { cwd: root, timeoutMs: 55_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.timedOut) return { action: "report", message: "[PHPStan] Bounded aggregate analysis timed out; rerun it against an explicit directory." };
  if (result.exitCode === 0) return null;
  const output = combinedOutput(result).trim();
  let detail = output.slice(0, 4000); try { const parsed = JSON.parse(output), messages = Object.entries(parsed.files ?? {}).flatMap(([file, data]) => (data.messages ?? []).slice(0, 3).map((item) => `${file}:${item.line ?? "?"} ${item.message}`)); if (messages.length) detail = messages.slice(0, 12).join("\n"); } catch { /* Preserve bounded raw output. */ }
  return { action: "deny", message: `[PHPStan] Aggregate analysis found blocking issues:\n${detail || "PHPStan exited non-zero without output."}` };
}

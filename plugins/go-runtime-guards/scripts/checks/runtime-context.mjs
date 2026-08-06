import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

const DAY = 24 * 60 * 60 * 1000;
function findUp(names, from) { let current = resolve(from), root = parse(current).root; while (true) { for (const name of names) { const candidate = join(current, name); if (existsSync(candidate)) return candidate; } if (current === root) return null; current = dirname(current); } }
function reserve(id, cwd) { const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA; if (!data) return true; const path = join(data, "go-runtime-guards", `${id}.json`); try { if (Date.now() - statSync(path).mtimeMs < DAY) return false; } catch { /* First injection. */ } try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify({ cwd, at: new Date().toISOString() })}\n`); return true; } catch { return false; } }

export function environmentContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd(), goMod = findUp(["go.mod"], cwd);
  if (!goMod || !reserve("environment", cwd)) return null;
  const text = readFileSync(goMod, "utf8"), facts = [];
  const module = text.match(/^module\s+(\S+)/mu)?.[1], version = text.match(/^go\s+(\S+)/mu)?.[1];
  if (module) facts.push(`module: ${module}`); if (version) facts.push(`Go version: ${version}`);
  const work = join(dirname(goMod), "go.work"); if (existsSync(work)) facts.push(`workspace: go.work (${(readFileSync(work, "utf8").match(/^\s*use\b/gmu) ?? []).length || "multiple"} modules)`);
  return facts.length ? ["[Go Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}

export function lintCoverageContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd(), goMod = findUp(["go.mod"], cwd);
  if (!goMod || !reserve("lint-coverage", cwd)) return null;
  const config = findUp([".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"], cwd);
  if (!config) return `[Go Lint Coverage]\n  go.mod: ${goMod}\n  golangci-lint config: not found\n  Add bounded static coverage for gosec, errcheck, staticcheck, and govulncheck.`;
  const text = readFileSync(config, "utf8"), missing = ["gosec", "errcheck", "staticcheck", "govulncheck"].filter((name) => !new RegExp(`\\b${name}\\b`, "u").test(text));
  return missing.length ? `[Go Lint Coverage]\n  config: ${config}\n  Missing linters: ${missing.join(", ")}` : null;
}

function responseText(event) { const response = event?.tool_response ?? event?.toolResponse ?? event?.tool?.response ?? {}; return [response.stdout, response.stderr, response.output, response.message].filter((value) => typeof value === "string").join("\n"); }
function jsonLines(text) { return text.split(/\r?\n/u).flatMap((line) => { try { return line.trim().startsWith("{") ? [JSON.parse(line)] : []; } catch { return []; } }); }

export function toolOutputReport(event) {
  const input = event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? {}, command = String(input.command ?? input.cmd ?? ""), text = responseText(event);
  if (!text || !/\b(?:go\s+test|golangci-lint\s+run|govulncheck)\b/u.test(command) || !/(?:^|\s)-json(?:\s|$)|--out-format(?:=|\s+)json\b/u.test(command)) return null;
  const lines = [];
  if (/\bgo\s+test\b/u.test(command)) {
    const events = jsonLines(text), failures = [...new Set(events.filter((item) => item.Action === "fail").map((item) => [item.Package, item.Test].filter(Boolean).join(" ") || "unknown"))];
    if (failures.length) lines.push(`[Go Test JSON] ${failures.length} failed package/test: ${failures.slice(0, 5).join("; ")}`);
    if (text.includes("WARNING: DATA RACE")) lines.push("[Go Race Detector] Data race reported; preserve goroutine ownership and file:line evidence before fixing.");
  }
  if (/golangci-lint/u.test(command)) { try { const issues = JSON.parse(text)?.Issues; if (Array.isArray(issues) && issues.length) lines.push(`[Go Lint JSON] ${issues.length} issue(s); group by linter and fix root causes.`); } catch { /* Mixed output. */ } }
  if (/govulncheck/u.test(command)) { const findings = jsonLines(text).filter((item) => item.finding); if (findings.length) lines.push(`[Go Vulnerability JSON] ${findings.length} reachable finding(s); verify fixed versions and upgrade impact.`); }
  return lines.length ? ["[Go Tool Output Primer]", ...lines].join("\n") : null;
}

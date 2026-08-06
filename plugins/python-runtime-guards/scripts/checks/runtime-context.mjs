import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { commandExists, combinedOutput, runCommand } from "../lib/process-utils.mjs";

const DAY = 24 * 60 * 60 * 1000;
function findUp(names, from) { let current = resolve(from), root = parse(current).root; while (true) { for (const name of names) { const candidate = join(current, name); if (existsSync(candidate)) return candidate; } if (current === root) return null; current = dirname(current); } }
function reserve(id, cwd) { const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA; if (!data) return true; const path = join(data, "python-runtime-guards", `${id}.json`); try { if (Date.now() - statSync(path).mtimeMs < DAY) return false; } catch { /* First injection. */ } try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify({ cwd, at: new Date().toISOString() })}\n`); return true; } catch { return false; } }

export function environmentContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd();
  const pyproject = findUp(["pyproject.toml"], cwd), requirements = findUp(["requirements.txt"], cwd), pipfile = findUp(["Pipfile"], cwd), version = findUp([".python-version"], cwd);
  if (!pyproject && !requirements && !pipfile && !version) return null;
  if (!reserve("environment", cwd)) return null;
  const root = dirname(pyproject ?? requirements ?? pipfile ?? version);
  const facts = [];
  if (version) facts.push(`Python version: ${readFileSync(version, "utf8").trim()}`);
  if (existsSync(join(root, "uv.lock"))) facts.push("Package manager: uv");
  else if (existsSync(join(root, "poetry.lock"))) facts.push("Package manager: Poetry");
  else if (pipfile) facts.push("Package manager: Pipenv");
  else if (requirements) facts.push("Package manager: pip (requirements.txt)");
  if (pyproject) {
    const text = readFileSync(pyproject, "utf8"), name = text.match(/^name\s*=\s*["']([^"']+)/mu)?.[1];
    if (name) facts.push(`Project: ${name}`);
    if (/django/iu.test(text)) facts.push("Framework: Django"); else if (/fastapi/iu.test(text)) facts.push("Framework: FastAPI"); else if (/flask/iu.test(text)) facts.push("Framework: Flask");
  }
  if (existsSync(join(root, ".venv")) || existsSync(join(root, "venv"))) facts.push("Virtual environment: project-local");
  return facts.length ? ["[Python Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}

function ruffCodes(text) {
  const codes = new Set();
  for (const section of text.matchAll(/\[(?:tool\.ruff\.lint|tool\.ruff)\]([\s\S]*?)(?=\n\[|$)/gu)) {
    for (const field of section[1].matchAll(/(?:select|extend-select)\s*=\s*\[([\s\S]*?)\]/gu)) for (const item of field[1].matchAll(/["']([^"']+)["']/gu)) codes.add(item[1]);
  }
  return codes;
}

export function lintCoverageContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd();
  const config = findUp(["ruff.toml", ".ruff.toml", "pyproject.toml"], cwd);
  if (!config || !reserve("lint-coverage", cwd)) return null;
  const codes = ruffCodes(readFileSync(config, "utf8"));
  const missing = ["S", "B", "DTZ", "ASYNC"].filter((target) => !codes.has("ALL") && ![...codes].some((code) => code === target || code.startsWith(target)));
  return missing.length ? `[Python Lint Coverage]\n  config: ${config}\n  Missing Ruff rule sets: ${missing.join(", ")}\n  Enable security, bugbear, timezone, and async coverage; run bandit/pip-audit in CI where applicable.` : null;
}

export async function ruffReport(filePath) {
  const target = resolve(filePath);
  if (!/\.pyi?$/iu.test(target) || !commandExists("ruff")) return null;
  const config = findUp(["ruff.toml", ".ruff.toml", "pyproject.toml"], dirname(target));
  const result = await runCommand("ruff", ["check", "--output-format=concise", "--no-fix", target], { cwd: config ? dirname(config) : dirname(target), timeoutMs: 8000 });
  if (result.exitCode === 0 || result.exitCode === 2) return null;
  const output = combinedOutput(result).trim();
  return output ? `[Ruff] ${output}\n\nFix the reported lint issue; the hook remains fail-open.` : null;
}

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

const DAY = 24 * 60 * 60 * 1000;
function findUp(names, from) { let current = resolve(from), root = parse(current).root; while (true) { for (const name of names) { const candidate = join(current, name); if (existsSync(candidate)) return candidate; } if (current === root) return null; current = dirname(current); } }
function reserve(cwd) { const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA; if (!data) return true; const path = join(data, "rust-runtime-guards", "environment.json"); try { if (Date.now() - statSync(path).mtimeMs < DAY) return false; } catch { /* First injection. */ } try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify({ cwd, at: new Date().toISOString() })}\n`); return true; } catch { return false; } }
function json(path) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }

export function environmentContext(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? process.cwd(), cargo = findUp(["Cargo.toml"], cwd);
  const tauri = findUp(["src-tauri/tauri.conf.json", "tauri.conf.json"], cwd);
  if (!cargo && !tauri || !reserve(cwd)) return null;
  const facts = [];
  if (cargo) {
    const text = readFileSync(cargo, "utf8"), name = text.match(/^name\s*=\s*"([^"]+)/mu)?.[1], edition = text.match(/^edition\s*=\s*"([^"]+)/mu)?.[1];
    if (name) facts.push(`Project: ${name}`); if (edition) facts.push(`Rust edition: ${edition}`);
    if (text.includes("[workspace]")) facts.push(`Workspace members: ${(text.match(/members\s*=\s*\[([\s\S]*?)\]/u)?.[1].match(/"[^"]+"/gu) ?? []).length || "configured"}`);
    const toolchain = join(dirname(cargo), "rust-toolchain.toml"); if (existsSync(toolchain)) { const channel = readFileSync(toolchain, "utf8").match(/channel\s*=\s*"([^"]+)/u)?.[1]; if (channel) facts.push(`Toolchain: ${channel}`); }
  }
  if (tauri) {
    const config = json(tauri); if (config) {
      const tauriRoot = dirname(tauri), cargoText = existsSync(join(tauriRoot, "Cargo.toml")) ? readFileSync(join(tauriRoot, "Cargo.toml"), "utf8") : "";
      const version = cargoText.match(/tauri\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/u); if (version) facts.push(`Tauri: ${(version[1] ?? version[2]).startsWith("2") ? "v2" : "v1"}`);
      const identifier = config.identifier ?? config.tauri?.bundle?.identifier; if (identifier) facts.push(`Identifier: ${identifier}`);
      const targets = config.bundle?.targets ?? config.tauri?.bundle?.targets; if (Array.isArray(targets)) facts.push(`Bundle targets: ${targets.join(", ")}`);
    }
  }
  return facts.length ? ["[Rust/Tauri Env]", ...facts.map((fact) => `  ${fact}`)].join("\n") : null;
}

/**
 * Load optional .process-confidence/config.yaml (minimal YAML subset).
 */

import { existsSync, readFileSync } from "node:fs";
import { configPath } from "./paths.mjs";

const DEFAULTS = Object.freeze({
  mode: "on",
  orphanWorkStop: "on",
  verifyCommandHints: [],
  verifyCommandExclude: [],
  minSeverity: "pass",
  showSessionIdInActive: false,
  activeMaxRunsListed: 20,
  claudeHome: "~",
  codexHome: "~",
});

/**
 * Parse a tiny YAML subset: key: value, lists with - item, booleans, numbers, strings.
 * Sufficient for PCF config; not a full YAML parser.
 */
export function parseSimpleYaml(text) {
  const out = {};
  let currentListKey = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "");
    if (!line.trim()) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentListKey) {
      out[currentListKey].push(unquote(listMatch[1].trim()));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const rest = kv[2].trim();
    if (rest === "" || rest === "[]") {
      out[key] = [];
      currentListKey = rest === "[]" ? null : key;
      if (rest === "[]") currentListKey = null;
      else currentListKey = key;
      continue;
    }
    currentListKey = null;
    out[key] = coerce(rest);
  }
  return out;
}

function unquote(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function coerce(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "on" || s === "off") return s;
  if (/^-?\d+$/.test(s)) return Number(s);
  return unquote(s);
}

export function loadConfig(workspaceRoot) {
  const path = configPath(workspaceRoot);
  let fileCfg = {};
  if (existsSync(path)) {
    try {
      fileCfg = parseSimpleYaml(readFileSync(path, "utf8"));
    } catch {
      fileCfg = {};
    }
  }

  const merged = { ...DEFAULTS, ...fileCfg };

  // Normalize on/off and bool aliases
  merged.orphanWorkStop = normalizeOnOff(merged.orphanWorkStop, "on");
  merged.mode = normalizeOnOff(merged.mode, "on");
  if (!Array.isArray(merged.verifyCommandHints)) {
    merged.verifyCommandHints = [];
  }
  if (!Array.isArray(merged.verifyCommandExclude)) {
    merged.verifyCommandExclude = [];
  }
  if (typeof merged.showSessionIdInActive !== "boolean") {
    merged.showSessionIdInActive = Boolean(merged.showSessionIdInActive);
  }
  if (typeof merged.activeMaxRunsListed !== "number") {
    merged.activeMaxRunsListed = DEFAULTS.activeMaxRunsListed;
  }

  return merged;
}

function normalizeOnOff(value, fallback) {
  if (value === true || value === "on" || value === "true") return "on";
  if (value === false || value === "off" || value === "false") return "off";
  return fallback;
}

export function isFeatureOn(value) {
  return value === "on" || value === true;
}

export { DEFAULTS };

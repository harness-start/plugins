/**
 * Machine-checkable first-principles ledger: parse + structural validation.
 * Does not judge whether atoms are "truly irreducible".
 */

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

const SCHEMA = "first-principles/v1";
const ASSUMPTION_STATUSES = new Set([
  "challenged",
  "retained",
  "rejected",
  "open",
]);
const ATOM_KINDS = new Set([
  "fact",
  "constraint",
  "measurement",
  "definition",
]);
const ATOM_SOURCES = new Set(["given", "observed", "assumed"]);

const FENCE_RE =
  /```(?:json)?[ \t]*first-principles(?:\/v1)?[ \t]*\r?\n([\s\S]*?)\r?\n```/iu;
const FENCE_GENERIC =
  /```json[ \t]*\r?\n([\s\S]*?first-principles\/v1[\s\S]*?)\r?\n```/iu;

function nonEmptyString(value, max = 4000) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, "utf8") <= max
  );
}

function asId(value) {
  return nonEmptyString(value, 64) ? value.trim() : null;
}

/**
 * Extract ledger object from raw file text (JSON file or fenced block in md).
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function extractLedgerObject(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) return { ok: false, error: "empty ledger content" };

  let m = text.match(FENCE_RE);
  if (!m) m = text.match(FENCE_GENERIC);
  const candidate = m ? m[1].trim() : text;

  try {
    const value = JSON.parse(candidate);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "ledger root must be a JSON object" };
    }
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: `ledger JSON parse failed: ${error?.message ?? error}`,
    };
  }
}

/**
 * Validate minimal structural schema + id reference integrity.
 * @returns {{ valid: boolean, findings: string[], ledger: object|null }}
 */
export function validateLedger(raw) {
  const findings = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, findings: ["ledger root must be an object"], ledger: null };
  }

  if (raw.schema !== SCHEMA) {
    findings.push(`schema must be "${SCHEMA}"`);
  }

  if (raw.status !== undefined && !["open", "closed"].includes(raw.status)) {
    findings.push('status must be "open" or "closed" when present');
  }

  const question = raw.question ?? raw.problem;
  if (!nonEmptyString(question)) {
    findings.push("question (or problem) must be a non-empty string");
  }

  if (
    raw.default_practice !== undefined &&
    raw.default_practice !== null &&
    !nonEmptyString(raw.default_practice, 8000)
  ) {
    findings.push("default_practice must be a non-empty string when present");
  }

  if (!Array.isArray(raw.assumptions) || raw.assumptions.length < 1) {
    findings.push("assumptions must be a non-empty array");
  } else {
    const aIds = new Set();
    raw.assumptions.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        findings.push(`assumptions[${index}] must be an object`);
        return;
      }
      const id = asId(item.id);
      if (!id) findings.push(`assumptions[${index}].id is required`);
      else if (aIds.has(id)) findings.push(`duplicate assumption id: ${id}`);
      else aIds.add(id);
      if (!nonEmptyString(item.claim)) {
        findings.push(`assumptions[${index}].claim is required`);
      }
      if (
        item.status !== undefined &&
        !ASSUMPTION_STATUSES.has(String(item.status))
      ) {
        findings.push(
          `assumptions[${index}].status must be one of ${[...ASSUMPTION_STATUSES].join("|")}`,
        );
      }
    });
  }

  if (!Array.isArray(raw.atoms) || raw.atoms.length < 1) {
    findings.push("atoms must be a non-empty array");
  }

  const atomIds = new Set();
  if (Array.isArray(raw.atoms)) {
    raw.atoms.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        findings.push(`atoms[${index}] must be an object`);
        return;
      }
      const id = asId(item.id);
      if (!id) findings.push(`atoms[${index}].id is required`);
      else if (atomIds.has(id)) findings.push(`duplicate atom id: ${id}`);
      else atomIds.add(id);
      if (!nonEmptyString(item.statement)) {
        findings.push(`atoms[${index}].statement is required`);
      }
      if (item.kind !== undefined && !ATOM_KINDS.has(String(item.kind))) {
        findings.push(
          `atoms[${index}].kind must be one of ${[...ATOM_KINDS].join("|")}`,
        );
      }
      if (item.source !== undefined && !ATOM_SOURCES.has(String(item.source))) {
        findings.push(
          `atoms[${index}].source must be one of ${[...ATOM_SOURCES].join("|")}`,
        );
      }
    });
  }

  const rebuild = raw.rebuild;
  let options = null;
  if (Array.isArray(raw.rebuild)) {
    options = raw.rebuild;
  } else if (rebuild && typeof rebuild === "object") {
    options = rebuild.options;
  }

  if (!Array.isArray(options) || options.length < 1) {
    findings.push("rebuild.options must be a non-empty array (or rebuild as array)");
  } else {
    options.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        findings.push(`rebuild.options[${index}] must be an object`);
        return;
      }
      if (!asId(item.id)) {
        findings.push(`rebuild.options[${index}].id is required`);
      }
      if (!nonEmptyString(item.conclusion)) {
        findings.push(`rebuild.options[${index}].conclusion is required`);
      }
      if (!Array.isArray(item.derived_from) || item.derived_from.length < 1) {
        findings.push(
          `rebuild.options[${index}].derived_from must be a non-empty array of atom ids`,
        );
      } else {
        for (const ref of item.derived_from) {
          const id = asId(ref);
          if (!id) {
            findings.push(
              `rebuild.options[${index}].derived_from contains empty id`,
            );
            continue;
          }
          if (atomIds.size > 0 && !atomIds.has(id)) {
            findings.push(
              `rebuild.options[${index}].derived_from references unknown atom id: ${id}`,
            );
          }
        }
      }
      if (item.rejects !== undefined && !Array.isArray(item.rejects)) {
        findings.push(`rebuild.options[${index}].rejects must be an array when present`);
      }
    });
  }

  if (!Array.isArray(raw.uncertainties) || raw.uncertainties.length < 1) {
    findings.push("uncertainties must be a non-empty array of strings");
  } else {
    raw.uncertainties.forEach((item, index) => {
      if (!nonEmptyString(item)) {
        findings.push(`uncertainties[${index}] must be a non-empty string`);
      }
    });
  }

  return {
    valid: findings.length === 0,
    findings,
    ledger: raw,
  };
}

function walkFiles(dir, out, maxFiles = 40) {
  if (out.length >= maxFiles) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= maxFiles) return;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walkFiles(full, out, maxFiles);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

function matchesSearchGlob(relPath, pattern) {
  const path = String(relPath).replaceAll("\\", "/");
  const pat = String(pattern).replaceAll("\\", "/");
  if (pat.endsWith("/**/*.json")) {
    const prefix = pat.slice(0, -"/**/*.json".length);
    return path.startsWith(`${prefix}/`) && path.endsWith(".json");
  }
  if (pat.endsWith("/**/*.md")) {
    const prefix = pat.slice(0, -"/**/*.md".length);
    return path.startsWith(`${prefix}/`) && path.endsWith(".md");
  }
  if (pat.endsWith("/**/*")) {
    const prefix = pat.slice(0, -"/**/*".length);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === pat;
}

function isSymlink(abs) {
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Locate and validate ledger under workspace.
 */
export function loadAndValidateLedger(workspaceRoot, config = {}) {
  const root = resolve(workspaceRoot);
  const primary =
    config?.ledger?.primaryRelativePath ?? ".first-principles/ledger.json";
  const maxBytes = config?.ledger?.maxBytes ?? 256 * 1024;
  const searchGlobs = config?.ledger?.searchGlobs ?? [
    ".first-principles/**/*.json",
    ".first-principles/**/*.md",
  ];

  const candidates = [];
  const primaryAbs = resolve(root, primary);
  if (existsSync(primaryAbs) && !isSymlink(primaryAbs)) {
    candidates.push(primaryAbs);
  }

  const fpRoot = resolve(root, ".first-principles");
  if (existsSync(fpRoot) && !isSymlink(fpRoot)) {
    const files = [];
    walkFiles(fpRoot, files);
    for (const abs of files) {
      if (candidates.includes(abs) || isSymlink(abs)) continue;
      const rel = relative(root, abs).replaceAll("\\", "/");
      if (searchGlobs.some((g) => matchesSearchGlob(rel, g))) {
        candidates.push(abs);
      }
    }
  }

  if (candidates.length === 0) {
    return {
      present: false,
      path: null,
      relativePath: null,
      valid: false,
      findings: [`missing ledger; write ${primary} with schema ${SCHEMA}`],
      ledger: null,
      mtimeMs: 0,
    };
  }

  let best = null;
  for (const abs of candidates) {
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const mtimeMs = Number(st.mtimeMs) || 0;
    if (st.size > maxBytes) {
      best = {
        present: true,
        path: abs,
        relativePath: relative(root, abs).replaceAll("\\", "/"),
        valid: false,
        findings: [`ledger exceeds maxBytes ${maxBytes}`],
        ledger: null,
        mtimeMs,
      };
      continue;
    }
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch (error) {
      best = {
        present: true,
        path: abs,
        relativePath: relative(root, abs).replaceAll("\\", "/"),
        valid: false,
        findings: [`cannot read ledger: ${error?.message ?? error}`],
        ledger: null,
        mtimeMs,
      };
      continue;
    }
    const extracted = extractLedgerObject(text);
    if (!extracted.ok) {
      best = {
        present: true,
        path: abs,
        relativePath: relative(root, abs).replaceAll("\\", "/"),
        valid: false,
        findings: [extracted.error],
        ledger: null,
        mtimeMs,
      };
      continue;
    }
    const result = validateLedger(extracted.value);
    const entry = {
      present: true,
      path: abs,
      relativePath: relative(root, abs).replaceAll("\\", "/"),
      valid: result.valid,
      findings: result.findings,
      ledger: result.ledger,
      mtimeMs,
    };
    if (result.valid) return entry;
    if (!best || abs === primaryAbs) best = entry;
  }

  return (
    best ?? {
      present: false,
      path: null,
      relativePath: null,
      valid: false,
      findings: ["missing ledger"],
      ledger: null,
      mtimeMs: 0,
    }
  );
}

export { SCHEMA as LEDGER_SCHEMA };

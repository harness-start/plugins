/**
 * Append-only decisions.tsv + work.jsonl with tip-window rewrite and hash chain.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { DECISION_KINDS } from "./policy.mjs";

export const META_SCHEMA = "goal-task/meta/v1";
export const WORK_SCHEMA = "goal-task/work/v1";

export const DECISION_COLUMNS = Object.freeze([
  "seq",
  "ts",
  "phase",
  "kind",
  "decision",
  "why",
  "evidence",
  "result",
  "scope",
  "prev_hash",
  "row_hash",
  "run_id",
  "session_id",
]);

export const DECISION_HEADER = DECISION_COLUMNS.join("\t");

const GENESIS = "0".repeat(64);

export function sha256Hex(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

export function sanitizeCell(value) {
  return String(value ?? "")
    .replace(/[\t\r\n]+/gu, " ")
    .trim();
}

export function makeRunId(now = new Date()) {
  const iso = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const short = randomBytes(3).toString("hex");
  return `${iso}-${short}`;
}

export function auditPaths(repoRoot, auditRoot, runId) {
  const repoRootAbs = resolve(repoRoot);
  const root = resolve(repoRootAbs, auditRoot);
  const relativeRoot = relative(repoRootAbs, root);
  if (
    !relativeRoot ||
    relativeRoot === ".." ||
    relativeRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeRoot)
  ) {
    throw new Error("auditRoot must resolve inside the repository root");
  }
  const runDir = join(root, "runs", runId);
  return {
    auditRootAbs: root,
    currentPath: join(root, "CURRENT"),
    readmePath: join(root, "README.md"),
    runDir,
    metaPath: join(runDir, "meta.json"),
    decisionsPath: join(runDir, "decisions.tsv"),
    workPath: join(runDir, "work.jsonl"),
    relative: {
      decisions: `${auditRoot}/runs/${runId}/decisions.tsv`,
      work: `${auditRoot}/runs/${runId}/work.jsonl`,
      meta: `${auditRoot}/runs/${runId}/meta.json`,
    },
  };
}

export function emptyMeta({
  runId,
  objective,
  sessionId,
  host = "unknown",
  tipWindow = 3,
  paths,
}) {
  return {
    schema: META_SCHEMA,
    runId,
    objective: String(objective ?? ""),
    sessionId: sessionId ?? null,
    host,
    status: "armed",
    startedAt: new Date().toISOString(),
    endedAt: null,
    supersededBy: null,
    decisionCount: 0,
    tipHash: null,
    sealedThroughSeq: 0,
    tipWindow,
    paths: paths ?? {},
  };
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

export function writeMeta(metaPath, meta) {
  atomicWrite(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

export function readMeta(metaPath) {
  if (!existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

export function readCurrent(currentPath) {
  if (!existsSync(currentPath)) return null;
  try {
    const text = readFileSync(currentPath, "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

export function writeCurrent(currentPath, runId) {
  if (runId == null || runId === "") {
    if (existsSync(currentPath)) {
      atomicWrite(currentPath, "");
    }
    return;
  }
  atomicWrite(currentPath, `${runId}\n`);
}

export function ensureReadme(readmePath) {
  if (existsSync(readmePath)) return;
  const body = `# goal-task audit

Append-only decision trail for host \`/goal\` runs (plugin: goal-task-gate).

- \`CURRENT\` — active run id
- \`runs/<run_id>/decisions.tsv\` — decision log (TSV)
- \`runs/<run_id>/work.jsonl\` — optional work lines
- \`runs/<run_id>/meta.json\` — run pointer (mutable)

Completion trailer (final reply last line):

\`GOAL_TASK_DONE run_id=<id> status=completed close_seq=<n> tip_hash=<hash>\`
`;
  atomicWrite(readmePath, body);
}

/**
 * Parse TSV body (without requiring header match strict).
 * @returns {{ header: string[], rows: object[], rawLines: string[] }}
 */
export function parseDecisionsTsv(text) {
  const rawLines = String(text ?? "").split(/\r?\n/u);
  while (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines.pop();
  if (rawLines.length === 0) {
    return { header: [...DECISION_COLUMNS], rows: [], rawLines: [] };
  }
  const header = rawLines[0].split("\t");
  const rows = [];
  for (let i = 1; i < rawLines.length; i += 1) {
    const cells = rawLines[i].split("\t");
    const row = {};
    for (let c = 0; c < DECISION_COLUMNS.length; c += 1) {
      row[DECISION_COLUMNS[c]] = cells[c] ?? "";
    }
    row._line = rawLines[i];
    rows.push(row);
  }
  return { header, rows, rawLines };
}

export function rowContentForHash(row) {
  // Hash over stable semantic cells + seq + prev_hash (not row_hash)
  const parts = [
    row.seq,
    row.ts,
    row.phase,
    row.kind,
    row.decision,
    row.why,
    row.evidence,
    row.result,
    row.scope,
    row.prev_hash,
    row.run_id,
    row.session_id,
  ].map(sanitizeCell);
  return parts.join("\t");
}

export function computeRowHash(row) {
  return sha256Hex(rowContentForHash(row));
}

/**
 * Validate header + hash chain. Sealed tipWindow not required for validity of chain.
 */
export function validateDecisionChain(rows) {
  const findings = [];
  let prevHash = GENESIS;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const seq = Number(row.seq);
    if (seq !== i + 1) {
      findings.push(`seq gap at index ${i}: expected ${i + 1}, got ${row.seq}`);
    }
    if (row.prev_hash !== prevHash) {
      findings.push(`prev_hash mismatch at seq=${row.seq}`);
    }
    const expected = computeRowHash(row);
    if (row.row_hash !== expected) {
      findings.push(`row_hash mismatch at seq=${row.seq}`);
    }
    if (row.kind && !DECISION_KINDS.includes(row.kind)) {
      findings.push(`invalid kind at seq=${row.seq}: ${row.kind}`);
    }
    prevHash = row.row_hash || prevHash;
  }
  return {
    valid: findings.length === 0,
    findings,
    tipHash: rows.length ? rows[rows.length - 1].row_hash : null,
    tipSeq: rows.length ? Number(rows[rows.length - 1].seq) : 0,
  };
}

export function loadDecisions(decisionsPath) {
  if (!existsSync(decisionsPath)) {
    return { header: [...DECISION_COLUMNS], rows: [], rawLines: [], exists: false };
  }
  const text = readFileSync(decisionsPath, "utf8");
  const parsed = parseDecisionsTsv(text);
  return { ...parsed, exists: true };
}

function rowToLine(row) {
  return DECISION_COLUMNS.map((col) => sanitizeCell(row[col])).join("\t");
}

/**
 * Append one decision row. Creates file+header if needed.
 */
export function appendDecision(decisionsPath, fields, { runId, sessionId, tipWindow = 3 }) {
  const loaded = loadDecisions(decisionsPath);
  const rows = loaded.rows;
  const prevHash = rows.length ? rows[rows.length - 1].row_hash : GENESIS;
  const seq = rows.length + 1;
  const ts = fields.ts ?? new Date().toISOString();
  const row = {
    seq: String(seq),
    ts,
    phase: sanitizeCell(fields.phase ?? ""),
    kind: sanitizeCell(fields.kind ?? "checkpoint"),
    decision: sanitizeCell(fields.decision ?? ""),
    why: sanitizeCell(fields.why ?? ""),
    evidence: sanitizeCell(fields.evidence ?? ""),
    result: sanitizeCell(fields.result ?? "open"),
    scope: sanitizeCell(fields.scope ?? ""),
    prev_hash: prevHash,
    row_hash: "",
    run_id: runId,
    session_id: sessionId ?? "",
  };
  if (!DECISION_KINDS.includes(row.kind)) {
    return { ok: false, error: `invalid kind: ${row.kind}` };
  }
  row.row_hash = computeRowHash(row);
  mkdirSync(dirname(decisionsPath), { recursive: true });
  if (!loaded.exists || loaded.rawLines.length === 0) {
    writeFileSync(decisionsPath, `${DECISION_HEADER}\n${rowToLine(row)}\n`, "utf8");
  } else {
    appendFileSync(decisionsPath, `${rowToLine(row)}\n`, "utf8");
  }
  const decisionCount = seq;
  const sealedThroughSeq = Math.max(0, decisionCount - tipWindow);
  return {
    ok: true,
    row,
    decisionCount,
    tipHash: row.row_hash,
    sealedThroughSeq,
  };
}

/**
 * Rewrite last k tip rows (1..tipWindow). Sealed prefix bytes must remain.
 * @param {object[]} newTipFields - 1..k field objects (without seq/hashes)
 */
export function rewriteTip(
  decisionsPath,
  k,
  newTipFields,
  { runId, sessionId, tipWindow = 3 },
) {
  const window = tipWindow;
  if (!Number.isInteger(k) || k < 1 || k > window) {
    return { ok: false, error: `k must be 1..${window}` };
  }
  if (!Array.isArray(newTipFields) || newTipFields.length < 1 || newTipFields.length > k) {
    return { ok: false, error: `newTipFields length must be 1..${k}` };
  }
  const loaded = loadDecisions(decisionsPath);
  const rows = loaded.rows;
  if (rows.length < k) {
    return { ok: false, error: `trail has only ${rows.length} rows; cannot rewrite tip ${k}` };
  }
  const keep = rows.slice(0, rows.length - k);
  const prevHash = keep.length ? keep[keep.length - 1].row_hash : GENESIS;
  let chainPrev = prevHash;
  const rebuilt = [...keep];
  for (let i = 0; i < newTipFields.length; i += 1) {
    const fields = newTipFields[i];
    const seq = keep.length + i + 1;
    const row = {
      seq: String(seq),
      ts: fields.ts ?? new Date().toISOString(),
      phase: sanitizeCell(fields.phase ?? ""),
      kind: sanitizeCell(fields.kind ?? "checkpoint"),
      decision: sanitizeCell(fields.decision ?? ""),
      why: sanitizeCell(fields.why ?? ""),
      evidence: sanitizeCell(fields.evidence ?? ""),
      result: sanitizeCell(fields.result ?? "open"),
      scope: sanitizeCell(fields.scope ?? ""),
      prev_hash: chainPrev,
      row_hash: "",
      run_id: runId,
      session_id: sessionId ?? "",
    };
    if (!DECISION_KINDS.includes(row.kind)) {
      return { ok: false, error: `invalid kind: ${row.kind}` };
    }
    row.row_hash = computeRowHash(row);
    chainPrev = row.row_hash;
    rebuilt.push(row);
  }
  // If fewer replacement rows than k, trail shortens (allowed tip truncate)
  const lines = [DECISION_HEADER, ...rebuilt.map(rowToLine)];
  atomicWrite(decisionsPath, `${lines.join("\n")}\n`);
  const decisionCount = rebuilt.length;
  return {
    ok: true,
    rows: rebuilt,
    decisionCount,
    tipHash: rebuilt.length ? rebuilt[rebuilt.length - 1].row_hash : null,
    sealedThroughSeq: Math.max(0, decisionCount - tipWindow),
  };
}

export function trailTipSummary(decisionsPath, expectedRunId) {
  const loaded = loadDecisions(decisionsPath);
  if (!loaded.rows.length) {
    return {
      runId: expectedRunId,
      closeSeq: 0,
      tipHash: null,
      kind: null,
      chainValid: true,
      rowCount: 0,
      hasClose: false,
    };
  }
  const chain = validateDecisionChain(loaded.rows);
  const last = loaded.rows[loaded.rows.length - 1];
  const hasClose = loaded.rows.some((r) => r.kind === "close");
  return {
    runId: last.run_id || expectedRunId,
    closeSeq: Number(last.seq),
    tipHash: last.row_hash,
    kind: last.kind,
    chainValid: chain.valid,
    chainFindings: chain.findings,
    rowCount: loaded.rows.length,
    hasClose,
    last,
  };
}

export function appendWorkLine(workPath, fields, { runId, sessionId }) {
  let prevHash = GENESIS;
  let seq = 1;
  if (existsSync(workPath)) {
    const lines = readFileSync(workPath, "utf8")
      .split(/\r?\n/u)
      .filter((l) => l.trim());
    if (lines.length) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        prevHash = last.row_hash || GENESIS;
        seq = (Number(last.seq) || lines.length) + 1;
      } catch {
        seq = lines.length + 1;
      }
    }
  }
  const obj = {
    schema: WORK_SCHEMA,
    seq,
    ts: fields.ts ?? new Date().toISOString(),
    decisionSeq: fields.decisionSeq ?? null,
    action: sanitizeCell(fields.action ?? "other"),
    targets: Array.isArray(fields.targets)
      ? fields.targets.map(String)
      : String(fields.targets ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
    summary: sanitizeCell(fields.summary ?? ""),
    evidence: sanitizeCell(fields.evidence ?? ""),
    run_id: runId,
    session_id: sessionId ?? "",
    prev_hash: prevHash,
    row_hash: "",
  };
  const content = [
    obj.seq,
    obj.ts,
    obj.decisionSeq,
    obj.action,
    JSON.stringify(obj.targets),
    obj.summary,
    obj.evidence,
    obj.prev_hash,
    obj.run_id,
    obj.session_id,
  ].join("\t");
  obj.row_hash = sha256Hex(content);
  mkdirSync(dirname(workPath), { recursive: true });
  appendFileSync(workPath, `${JSON.stringify(obj)}\n`, "utf8");
  return { ok: true, line: obj };
}

/**
 * Create a new run on disk + optional open row.
 */
export function createRun(repoRoot, {
  auditRoot,
  runId,
  objective,
  sessionId,
  host,
  tipWindow,
  openWhy = "goal armed",
  writeOpenRow = true,
}) {
  const paths = auditPaths(repoRoot, auditRoot, runId);
  mkdirSync(paths.runDir, { recursive: true });
  ensureReadme(paths.readmePath);
  const meta = emptyMeta({
    runId,
    objective,
    sessionId,
    host,
    tipWindow,
    paths: paths.relative,
  });
  if (writeOpenRow) {
    const appended = appendDecision(
      paths.decisionsPath,
      {
        phase: "start",
        kind: "open",
        decision: "opened goal-task audit run",
        why: openWhy,
        evidence: paths.relative.decisions,
        result: "open",
        scope: "",
      },
      { runId, sessionId, tipWindow },
    );
    if (appended.ok) {
      meta.decisionCount = appended.decisionCount;
      meta.tipHash = appended.tipHash;
      meta.sealedThroughSeq = appended.sealedThroughSeq;
    }
  } else if (!existsSync(paths.decisionsPath)) {
    writeFileSync(paths.decisionsPath, `${DECISION_HEADER}\n`, "utf8");
  }
  writeMeta(paths.metaPath, meta);
  writeCurrent(paths.currentPath, runId);
  return { paths, meta };
}

export function finalizeRunMeta(metaPath, patch) {
  const meta = readMeta(metaPath);
  if (!meta) return null;
  Object.assign(meta, patch);
  if (!meta.endedAt && patch.status && patch.status !== "armed") {
    meta.endedAt = new Date().toISOString();
  }
  writeMeta(metaPath, meta);
  return meta;
}

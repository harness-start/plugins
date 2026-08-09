import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;

function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function dataRoot() { return process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? null; }

function pathFor(kind, key) {
  const root = dataRoot();
  if (!root) return null;
  return join(resolve(root), "behavioral-regression-guard", kind, `${digest(key)}.json`);
}

function atomicWrite(path, value) {
  if (!path) return false;
  const directory = dirname(path);
  const temp = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temp, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temp, path);
    return true;
  } catch {
    try { rmSync(temp, { force: true }); } catch {}
    return false;
  }
}

function read(path) {
  if (!path) return { kind: "missing", value: null };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!value || value.version !== VERSION) return { kind: "corrupt", value: null };
    return { kind: "ok", value };
  } catch (error) {
    return error?.code === "ENOENT" ? { kind: "missing", value: null } : { kind: "corrupt", value: null };
  }
}

export function readSession(sessionId, repoRoot) { return read(pathFor("sessions", `${sessionId}\0${resolve(repoRoot)}`)); }
export function writeSession(sessionId, repoRoot, value) { return atomicWrite(pathFor("sessions", `${sessionId}\0${resolve(repoRoot)}`), { version: VERSION, ...value, updatedAt: Date.now() }); }
export function readRun(repoRoot, contractId) { return read(pathFor("runs", `${resolve(repoRoot)}\0${contractId}`)); }
export function writeRun(repoRoot, contractId, value) { return atomicWrite(pathFor("runs", `${resolve(repoRoot)}\0${contractId}`), { version: VERSION, ...value, updatedAt: Date.now() }); }

export function newRun({ contract, path, plan, productionFingerprint, sessionId }) {
  return {
    contractId: contract.id,
    contractPath: resolve(path),
    epoch: contract.epoch,
    planDigest: plan,
    baselineProductionFingerprint: productionFingerprint,
    verificationFingerprint: null,
    receipts: [],
    sequence: 0,
    invalidReason: null,
    lease: contract.status === "open" ? { sessionId, active: true } : { sessionId: null, active: false },
  };
}

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const EMPTY = Object.freeze({
  schema: "compact-context-journal-state/v1",
  pendingPromptId: null,
  pendingCompact: null,
  recoveryRequired: null,
  receiptCandidates: {},
  activeBoundaryId: null,
  latestCompactId: null,
  compromised: false,
  stopReminders: 0,
  mutationSentinels: {},
  journalTip: null,
});

function fresh() {
  return structuredClone(EMPTY);
}

export function loadSessionState(location) {
  if (!existsSync(location.statePath)) return fresh();
  try {
    const parsed = JSON.parse(readFileSync(location.statePath, "utf8"));
    if (parsed?.schema !== EMPTY.schema) return fresh();
    return { ...fresh(), ...parsed };
  } catch {
    return fresh();
  }
}

export function saveSessionState(location, state) {
  mkdirSync(location.stateDir, { recursive: true, mode: 0o700 });
  const temporary = `${location.statePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ ...fresh(), ...state }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, location.statePath);
  chmodSync(location.statePath, 0o600);
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function withSessionLock(location, callback) {
  mkdirSync(location.locksDir, { recursive: true, mode: 0o700 });
  const ownerPath = join(location.lockPath, "owner.json");
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      mkdirSync(location.lockPath, { mode: 0o700 });
      writeFileSync(ownerPath, `${JSON.stringify({ pid: process.pid, createdAt: Date.now() })}\n`, { mode: 0o600 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const age = Date.now() - statSync(location.lockPath).mtimeMs;
        let ownerAlive = true;
        try {
          const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
          process.kill(Number(owner.pid), 0);
        } catch (ownerError) {
          ownerAlive = ownerError?.code !== "ESRCH" && existsSync(ownerPath);
        }
        if (age > 30_000 && !ownerAlive) {
          if (existsSync(ownerPath)) unlinkSync(ownerPath);
          rmdirSync(location.lockPath);
        }
      } catch {
        // Another process may have released the lock between checks.
      }
      if (Date.now() >= deadline) throw new Error("journal lock timeout");
      wait(25);
    }
  }
  try {
    return callback();
  } finally {
    try {
      if (existsSync(ownerPath)) unlinkSync(ownerPath);
      rmdirSync(location.lockPath);
    } catch {
      // A released lock needs no cleanup retry.
    }
  }
}

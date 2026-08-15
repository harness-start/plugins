import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const STALE_LOCK_MS = 30_000;
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

export function digestKey(value: string): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function atomicWriteJson(path: string, value: unknown): boolean {
  const directory = dirname(path);
  const temporary = join(directory, `.${digestKey(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: FILE_MODE, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try { rmSync(temporary, { force: true }); } catch { /* ignore */ }
    return false;
  }
}

export function withPathLock<T>(path: string, operation: () => T): T {
  const lockPath = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      mkdirSync(lockPath, { mode: DIRECTORY_MODE });
      try {
        return operation();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        if (!existsSync(lockPath)) continue;
      }
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring lock: ${lockPath}`);
      Atomics.wait(WAIT_BUFFER, 0, 0, 10);
    }
  }
}
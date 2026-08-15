import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const LOCK_STALE_MS = 10_000;
const LOCK_RETRIES = 40;
const LOCK_WAIT_MS = 25;

export function sanitizeSessionKey(sessionId: string | null | undefined, cwd: string): string {
  const raw = String(sessionId ?? "").trim();
  if (raw) {
    return raw.replace(/[^A-Za-z0-9._-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 120) || "session";
  }
  return `cwd-${createHash("sha256").update(String(cwd ?? "")).digest("hex").slice(0, 16)}`;
}

export function trailPaths(repoRoot: string, auditRoot: string, sessionKey: string) {
  const root = join(resolve(repoRoot), auditRoot);
  return {
    root,
    sessionsDir: join(root, "sessions"),
    gitignorePath: join(root, ".gitignore"),
    readmePath: join(root, "README.md"),
    sessionPath: join(root, "sessions", `${sessionKey}.jsonl`),
  };
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait keeps hook scripts dependency-free
  }
}

export function acquireLock(sessionPath: string): { fd: number; lockPath: string } | null {
  const lockPath = `${sessionPath}.lock`;
  mkdirSync(dirname(sessionPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeSync(fd, `${process.pid}\n${Date.now()}\n`);
      return { fd, lockPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const raw = readFileSync(lockPath, "utf8");
        const ts = Number(raw.split("\n")[1] ?? 0);
        if (Number.isFinite(ts) && Date.now() - ts > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        // ignore
      }
      sleepMs(LOCK_WAIT_MS);
    }
  }
  return null;
}

export function releaseLock(lock: { fd: number; lockPath: string } | null): void {
  if (!lock) return;
  try { closeSync(lock.fd); } catch { /* ignore */ }
  try { unlinkSync(lock.lockPath); } catch { /* ignore */ }
}

export function appendRecord(sessionPath: string, record: unknown): string {
  mkdirSync(dirname(sessionPath), { recursive: true, mode: 0o700 });
  const line = `${JSON.stringify(record)}\n`;
  const lock = acquireLock(sessionPath);
  try {
    const flag = existsSync(sessionPath) ? "a" : "ax";
    try {
      appendFileSync(sessionPath, line, { encoding: "utf8", mode: 0o600, flag });
    } catch {
      appendFileSync(sessionPath, line, { encoding: "utf8", mode: 0o600 });
    }
  } finally {
    releaseLock(lock);
  }
  return sessionPath;
}

export function readLastNonEmptyLine(sessionPath: string) {
  if (!existsSync(sessionPath)) return null;
  const content = readFileSync(sessionPath, "utf8");
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line && line.trim()) return { line, index: i, lines, content };
  }
  return null;
}

export function rewriteTip(
  sessionPath: string,
  predicate: (parsed: unknown) => boolean,
  nextRecord: unknown,
): "rewritten" | "miss" | "error" | "busy" {
  const lock = acquireLock(sessionPath);
  if (!lock) return "busy";
  const temporary = `${sessionPath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    const tip = readLastNonEmptyLine(sessionPath);
    if (!tip) return "miss";
    let parsed: unknown;
    try {
      parsed = JSON.parse(tip.line);
    } catch {
      return "miss";
    }
    if (!predicate(parsed)) return "miss";
    const nextLines = tip.lines.slice();
    nextLines[tip.index] = JSON.stringify(nextRecord);
    while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") nextLines.pop();
    const recheck = readLastNonEmptyLine(sessionPath);
    if (!recheck || recheck.line !== tip.line || recheck.index !== tip.index) return "miss";
    writeFileSync(temporary, `${nextLines.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, sessionPath);
    return "rewritten";
  } catch {
    try { rmSync(temporary, { force: true }); } catch { /* ignore */ }
    return "error";
  } finally {
    releaseLock(lock);
  }
}

export function prepareTrail(
  repoRoot: string,
  auditRoot: string,
  sessionKey: string,
  layout: { gitignore: string; readme: string },
) {
  const paths = trailPaths(repoRoot, auditRoot, sessionKey);
  mkdirSync(paths.sessionsDir, { recursive: true, mode: 0o700 });
  if (!existsSync(paths.gitignorePath)) writeFileSync(paths.gitignorePath, layout.gitignore, { encoding: "utf8", mode: 0o600 });
  if (!existsSync(paths.readmePath)) writeFileSync(paths.readmePath, layout.readme, { encoding: "utf8", mode: 0o600 });
  return paths;
}
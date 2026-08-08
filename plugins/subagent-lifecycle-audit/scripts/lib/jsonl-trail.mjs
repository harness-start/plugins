import {
  appendFile,
  mkdir,
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const README_TEXT = `# Subagent lifecycle audit

Append-only lifecycle observations written by the subagent-lifecycle-audit plugin.
The trail contains lifecycle metadata only; it does not contain prompts, responses,
commands, file paths, or tool input/output.
`;
const LOCK_STALE_MS = 10_000;
const LOCK_RETRIES = 40;
const LOCK_WAIT_MS = 25;

export function trailPaths(repoRoot, sessionKey) {
  const root = join(resolve(repoRoot), ".subagent-lifecycle-audit");
  return {
    root,
    sessionsDir: join(root, "sessions"),
    readmePath: join(root, "README.md"),
    sessionPath: join(root, "sessions", `${sessionKey}.jsonl`),
  };
}

async function ensureLayout(paths) {
  await mkdir(paths.sessionsDir, { recursive: true, mode: 0o700 });
  try {
    await writeFile(paths.readmePath, README_TEXT, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function acquireLock(sessionPath) {
  const lockPath = `${sessionPath}.lock`;
  await mkdir(dirname(sessionPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n${Date.now()}\n`);
      return { handle, lockPath };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await unlink(lockPath);
          continue;
        }
      } catch (lockError) {
        if (lockError?.code !== "ENOENT") throw lockError;
      }
      await delay(LOCK_WAIT_MS);
    }
  }
  return null;
}

async function releaseLock(lock) {
  if (!lock) return;
  try {
    await lock.handle.close();
  } finally {
    try {
      await unlink(lock.lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function readRowsUnlocked(sessionPath) {
  let body;
  try {
    body = await readFile(sessionPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const rows = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({ schema: "invalid-jsonl-row/v1" });
    }
  }
  return rows;
}

export async function appendLifecycleRecord(paths, buildRecord) {
  await ensureLayout(paths);
  const lock = await acquireLock(paths.sessionPath);
  if (!lock) throw new Error("audit trail lock is busy");
  try {
    const rows = await readRowsUnlocked(paths.sessionPath);
    const record = buildRecord(rows);
    await appendFile(paths.sessionPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return record;
  } finally {
    await releaseLock(lock);
  }
}

export async function readSessionRows(sessionPath) {
  return readRowsUnlocked(sessionPath);
}

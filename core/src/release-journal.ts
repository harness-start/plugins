import { closeSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export async function withReleaseJournal<T>(options: {
  journalPath: string;
  write: () => Promise<T> | T;
}): Promise<T> {
  let fd: number | undefined;
  try {
    fd = openSync(options.journalPath, "wx", 0o600);
    writeFileSync(fd, `${Date.now()}\n`);
    const result = await options.write();
    return result;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

export function atomicRenameWrite(path: string, contents: string | Buffer): void {
  const temporary = join(dirname(path), `.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
  try { rmSync(temporary, { force: true }); } catch { /* ignore */ }
}
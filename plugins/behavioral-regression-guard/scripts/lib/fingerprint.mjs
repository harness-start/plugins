import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function fingerprintPaths(root, paths, { allowMissing = false } = {}) {
  const findings = [];
  const entries = [];
  for (const path of [...paths].sort()) {
    const absolute = resolve(root, path);
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) { findings.push(`${path} is a symlink`); continue; }
      if (!stat.isFile()) { findings.push(`${path} is not a regular file`); continue; }
      const bytes = readFileSync(absolute);
      entries.push({ path, kind: "file", digest: createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) entries.push({ path, kind: "missing" });
      else findings.push(`${path} is missing or unreadable`);
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    entries,
    digest: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}

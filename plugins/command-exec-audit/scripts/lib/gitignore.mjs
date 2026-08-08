import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureGitignore(repoRoot, pattern) {
  if (!repoRoot || !pattern) return { ok: false, action: "skipped" };
  const path = join(repoRoot, ".gitignore");
  const line = String(pattern).trim();
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const already = new RegExp(`^\\s*${escaped}\\s*(?:#.*)?$`, "mu");
  try {
    if (!existsSync(path)) {
      writeFileSync(path, `${line}\n`, "utf8");
      return { ok: true, action: "created", path };
    }
    const content = readFileSync(path, "utf8");
    if (already.test(content)) return { ok: true, action: "present", path };
    const needsNl = content.length > 0 && !content.endsWith("\n");
    writeFileSync(path, `${content}${needsNl ? "\n" : ""}${line}\n`, "utf8");
    return { ok: true, action: "appended", path };
  } catch {
    return { ok: false, action: "error", path };
  }
}

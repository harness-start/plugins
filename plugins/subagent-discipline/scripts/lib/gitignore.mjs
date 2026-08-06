import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GITIGNORE_PATTERN } from "./policy.mjs";

const ALREADY_RE =
  /^\s*(?:\*\*\/)?\.subagent-discipline\/?\s*(?:#.*)?$/mu;

/**
 * Ensure git root .gitignore contains the ledger pattern.
 * No-op when gitRoot is null/missing. Best-effort; never throws to caller if wrapped.
 * @returns {{ ok: boolean, action: "skipped"|"present"|"created"|"appended"|"error", path?: string }}
 */
export function ensureIgnorePattern(gitRoot, pattern = GITIGNORE_PATTERN) {
  if (!gitRoot || typeof gitRoot !== "string") {
    return { ok: false, action: "skipped" };
  }

  const path = join(gitRoot, ".gitignore");
  const line = pattern.endsWith("\n") ? pattern.trimEnd() : pattern;

  try {
    if (!existsSync(path)) {
      writeFileSync(path, `${line}\n`, "utf8");
      return { ok: true, action: "created", path };
    }

    const content = readFileSync(path, "utf8");
    if (ALREADY_RE.test(content)) {
      return { ok: true, action: "present", path };
    }

    const needsNl = content.length > 0 && !content.endsWith("\n");
    writeFileSync(path, `${content}${needsNl ? "\n" : ""}${line}\n`, "utf8");
    return { ok: true, action: "appended", path };
  } catch {
    return { ok: false, action: "error", path };
  }
}

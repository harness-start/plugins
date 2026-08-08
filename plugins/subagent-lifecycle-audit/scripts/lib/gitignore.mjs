import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const IGNORE_LINE = ".subagent-lifecycle-audit/";
const IGNORE_RE = /^\s*(?:\*\*\/)?\.subagent-lifecycle-audit\/?\s*(?:#.*)?$/mu;

export async function ensureGitignore(repoRoot) {
  const path = join(repoRoot, ".gitignore");
  let body = "";
  try {
    body = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(path, `${IGNORE_LINE}\n`, { encoding: "utf8", mode: 0o600 });
    return true;
  }
  if (IGNORE_RE.test(body)) return false;
  const prefix = body && !body.endsWith("\n") ? "\n" : "";
  await appendFile(path, `${prefix}${IGNORE_LINE}\n`, "utf8");
  return true;
}

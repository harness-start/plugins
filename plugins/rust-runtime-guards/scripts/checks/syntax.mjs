/**
 * Rust syntax (best-effort). Fail-open without toolchain.
 */
import { extname, basename } from "node:path";
import { readFileSync, existsSync, statSync } from "node:fs";

const EXTS = new Set([".rs"]);

export function matches(filePath) {
  return EXTS.has(extname(basename(filePath)).toLowerCase());
}

export async function check(filePath) {
  if (!existsSync(filePath)) return null;
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > 2 * 1024 * 1024) return null;
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  // Lightweight structural heuristics only (no hard parser dependency).
  const open = (text.match(/\{/g) || []).length;
  const close = (text.match(/\}/g) || []).length;
  if (open !== close && Math.abs(open - close) > 2) {
    return { code: 1, stderr: `unbalanced braces: open=${open} close=${close}` };
  }
  return null;
}

export function formatFailure(result, filePath) {
  return [
    `[Rust Syntax] 启发式语法检查提示：${filePath}`,
    result?.stderr || "unknown",
  ].join("\n");
}

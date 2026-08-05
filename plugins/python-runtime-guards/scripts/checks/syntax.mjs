/**
 * Python syntax (python -m py_compile). Fail-open if python missing.
 */
import { spawn } from "node:child_process";
import { extname, basename } from "node:path";

const EXTS = new Set([".py"]);

export function matches(filePath) {
  return EXTS.has(extname(basename(filePath)).toLowerCase());
}

export function check(filePath) {
  return new Promise((resolve) => {
    const child = spawn("python3", ["-m", "py_compile", filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code === 0) resolve(null);
      else resolve({ code, stderr: stderr.trim().slice(0, 2000) });
    });
  });
}

export function formatFailure(result, filePath) {
  return [
    `[Python Syntax] python -m py_compile 失败：${filePath}`,
    result?.stderr || `(exit ${result?.code})`,
  ].join("\n");
}

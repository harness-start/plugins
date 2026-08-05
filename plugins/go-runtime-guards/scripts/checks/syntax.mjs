/**
 * Go syntax (gofmt -e). Fail-open if gofmt missing.
 */
import { spawn } from "node:child_process";
import { extname, basename } from "node:path";

const EXTS = new Set([".go"]);

export function matches(filePath) {
  return EXTS.has(extname(basename(filePath)).toLowerCase());
}

export function check(filePath) {
  return new Promise((resolve) => {
    const child = spawn("gofmt", ["-e", filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (!stderr.trim()) resolve(null);
      else resolve({ code, stderr: stderr.trim().slice(0, 2000) });
    });
  });
}

export function formatFailure(result, filePath) {
  return [
    `[Go Syntax] gofmt 报告问题：${filePath}`,
    result?.stderr || `(exit ${result?.code})`,
  ].join("\n");
}

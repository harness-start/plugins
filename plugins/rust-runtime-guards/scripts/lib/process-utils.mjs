/**
 * Subprocess helpers: PATH command detection and async bounded execution.
 */

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export function commandExists(name) {
  const names =
    process.platform === "win32"
      ? [`${name}.bat`, `${name}.exe`, `${name}.cmd`]
      : [name];
  const pathValue = process.env.PATH ?? "";
  const separator = process.platform === "win32" ? ";" : ":";
  for (const dir of pathValue.split(separator).filter(Boolean)) {
    for (const candidate of names) {
      try {
        if (statSync(join(dir, candidate)).isFile()) return true;
      } catch {
        // keep scanning
      }
    }
  }
  return false;
}

export function hasCommand(name) {
  return commandExists(name);
}

/**
 * Run a command with a hard timeout. Never rejects: hook scripts must be
 * fail-open on every infrastructure failure.
 */
export function runCommand(file, args, { cwd, timeoutMs = 8000, maxBuffer = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd, timeout: timeoutMs, maxBuffer },
      (error, stdout, stderr) => {
        const out = Buffer.isBuffer(stdout) ? stdout.toString("utf8") : String(stdout ?? "");
        const err = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? "");
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : error ? null : 0,
          stdout: out,
          stderr: err,
          timedOut: Boolean(error?.killed) || error?.signal === "SIGTERM",
          errorCode: error?.code ?? null,
        });
      },
    );
  });
}

/** Combined stdout+stderr, preferring non-empty output (source getExecOutput semantics). */
export function combinedOutput(result) {
  return result.stdout.trim() ? result.stdout : result.stderr;
}

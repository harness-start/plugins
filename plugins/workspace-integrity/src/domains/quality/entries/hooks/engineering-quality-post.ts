#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const checks = ["line-budget-check.mjs", "markdown-check.mjs"];

export function runChecks(input: Buffer): number {
  let exitCode = 0;
  for (const check of checks) {
    const entry = fileURLToPath(new URL(`./${check}`, import.meta.url));
    const result = spawnSync(process.execPath, [entry], {
      env: process.env,
      input,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) process.stderr.write(`[engineering-quality] ${check}: ${result.error.message}\n`);
    if ((result.status ?? 0) !== 0) exitCode = 2;
  }
  return exitCode;
}

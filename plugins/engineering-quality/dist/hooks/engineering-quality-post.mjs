#!/usr/bin/env node
// harness-source-hash: sha256:8227754133151ebd04a3c2c3aa087c18c57010abf91e1999feb0596bd78e76fa

// plugins/engineering-quality/src/entries/hooks/engineering-quality-post.ts
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
var checks = ["line-budget-check.mjs", "markdown-check.mjs"];
function runChecks(input) {
  let exitCode = 0;
  for (const check of checks) {
    const entry = fileURLToPath(new URL(`./${check}`, import.meta.url));
    const result = spawnSync(process.execPath, [entry], {
      env: process.env,
      input,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) process.stderr.write(`[engineering-quality] ${check}: ${result.error.message}
`);
    if ((result.status ?? 0) !== 0) exitCode = 2;
  }
  return exitCode;
}
var entryPath = process.argv[1];
if (entryPath && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  process.exitCode = runChecks(readFileSync(0));
}
export {
  runChecks
};

#!/usr/bin/env node

import { resolve } from "node:path";

import { runLocalEslint } from "@harness/core/eslint-local-runner";
import { createPreset } from "../../lib/eslint/preset.js";

async function main() {
  const { output, failed } = await runLocalEslint({
    root: resolve(process.argv[2] ?? ""),
    preset: createPreset,
    defaultFiles: ["src/{sections,cover}/*.tsx"],
    extraFiles: process.argv.slice(3),
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`[print-project-lint] ${error.message}\n`); process.exitCode = 2; });

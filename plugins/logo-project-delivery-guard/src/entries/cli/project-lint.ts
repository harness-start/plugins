#!/usr/bin/env node

import { resolve } from "node:path";

import { runLocalEslint } from "@harness/core/eslint-local-runner";
import { createPreset } from "../../lib/eslint/preset.js";
import { assertLogoProjectRoot } from "../../lib/project.js";

async function main() {
  const root = resolve(process.argv[2] ?? "");
  await assertLogoProjectRoot(root);
  const { output, failed } = await runLocalEslint({
    root,
    preset: createPreset,
    defaultFiles: ["src/master/*.logo.tsx"],
    extraFiles: process.argv.slice(3),
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`[logo-project-lint] ${error.message}\n`); process.exitCode = 2; });

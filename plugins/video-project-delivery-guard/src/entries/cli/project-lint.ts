#!/usr/bin/env node

import { resolve } from "node:path";

import { runLocalEslint } from "@harness/core/eslint-local-runner";
import { createPreset } from "../../lib/eslint/preset.js";
import { assertVideoProjectRoot } from "../../lib/writer.js";

async function main() {
  const root = assertVideoProjectRoot(resolve(process.argv[2] ?? ""));
  const requested = process.argv.slice(3);
  if (requested.some((filePath) => !/^src\/visual\/(?:\*|[a-z0-9][a-z0-9.-]*)\.tsx$/u.test(filePath))) throw new Error("LINT_TARGET_OUT_OF_SCOPE");
  const { output, failed } = await runLocalEslint({
    root,
    preset: createPreset,
    defaultFiles: ["src/visual/*.tsx"],
    extraFiles: requested,
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-lint] ${message}\n`);
  process.exitCode = 2;
});

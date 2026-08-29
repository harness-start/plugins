#!/usr/bin/env node

import { resolve } from "node:path";

import { runLocalEslint } from "@harness/core/eslint-local-runner";
import { loadPptxProject, validatePptxModel } from "../../lib/contract.js";
import { createPreset } from "../../lib/eslint/preset.js";

async function main() {
  const root = resolve(process.argv[2] ?? "");
  const model = await loadPptxProject(root);
  const findings = validatePptxModel(model, { stage: "source" });
  if (findings.length > 0) {
    process.stderr.write(`${findings.map(({ code, path, message }) => `${code}:${path}:${message}`).join("\n")}\n`);
    process.exitCode = 2;
    return;
  }
  const { output, failed } = await runLocalEslint({
    root,
    preset: createPreset,
    defaultFiles: ["src/slides/*.ts"],
    extraFiles: process.argv.slice(3),
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}

await main().catch((error: unknown) => { process.stderr.write(`[pptx-project-lint] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });

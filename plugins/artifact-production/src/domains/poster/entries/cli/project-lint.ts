#!/usr/bin/env node

import { runLocalEslint } from "@harness/core/eslint-local-runner";
import { createPreset } from "../../lib/eslint/preset.js";
import { loadPosterProject, validatePosterModel } from "../../lib/contract.js";
import { assertPosterProjectRoot } from "../../lib/writer.js";

async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const model = await loadPosterProject(root);
  const findings = validatePosterModel(model, { stage: "source" });
  if (findings.length) {
    process.stderr.write(`${findings.map(({ code, path, message }) => `${path} [${code}] ${message}`).join("\n")}\n`);
    process.exitCode = 2;
    return;
  }
  const { output, failed } = await runLocalEslint({ root, preset: createPreset, defaultFiles: ["src/variants/*/layers/*.tsx"], extraFiles: [] });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}

await main().catch((error: unknown) => { process.stderr.write(`[poster-project-lint] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });

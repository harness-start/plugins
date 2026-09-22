#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

import { runLocalEslint } from "@harness/core/eslint-local-runner";
import { loadPptxProject, validatePptxModel } from "../../lib/contract.js";
import { createPreset } from "../../lib/eslint/preset.js";

function runTypecheck(root: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
    const child = spawn(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        if (output.length < 1024 * 1024) output += String(chunk);
      });
    child.on("error", (error) => reject(new Error(`TYPESCRIPT_UNAVAILABLE:${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`TYPESCRIPT_FAILED:${output.trim()}`));
    });
  });
}

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
    defaultFiles: ["src/**/*.ts"],
    extraFiles: process.argv.slice(3),
  });
  if (output) process.stdout.write(output);
  if (failed) {
    process.exitCode = 2;
    return;
  }
  await runTypecheck(root);
}

await main().catch((error: unknown) => { process.stderr.write(`[pptx-project-lint] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });

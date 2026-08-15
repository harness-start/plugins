#!/usr/bin/env node

import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import preset from "../../lib/eslint/preset.js";
import { loadCompositionDeterministic } from "../../lib/composition-loader.js";
import { validateMusicModel } from "../../lib/contract.js";
import { optimizeComposition } from "../../lib/music-math.js";
import { collectMusicModel } from "../../lib/release.js";

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const model = await collectMusicModel(root);
  const findings = validateMusicModel(model, { stage: "design" });
  optimizeComposition(await loadCompositionDeterministic(root));
  const require = createRequire(join(root, "package.json"));
  const loaded = await import(pathToFileURL(require.resolve("eslint")).href);
  const { ESLint } = loaded.default ?? loaded;
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: preset });
  const results = await eslint.lintFiles(["src/**/*.mjs"]);
  for (const result of results) {
    for (const message of result.messages) findings.push({ code: message.ruleId ?? "ESLINT", path: `${result.filePath}:${message.line}:${message.column}`, message: message.message });
  }
  if (findings.length > 0) {
    const first = findings[0];
    throw new Error(`${first?.code}:${first?.path}:${first?.message}`);
  }
  process.stdout.write(`${JSON.stringify({ valid: true, files: results.length })}\n`);
}

main().catch((error: unknown) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[tonejs-music-lint] ${message}\n`);
  process.exitCode = 2;
});

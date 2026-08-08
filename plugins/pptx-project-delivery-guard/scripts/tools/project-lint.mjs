#!/usr/bin/env node

import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPreset } from "../../eslint/preset.mjs";

async function main() {
  const root = resolve(process.argv[2] ?? "");
  const projectRequire = createRequire(join(root, "package.json"));
  let eslintEntry;
  let parserEntry;
  try {
    eslintEntry = projectRequire.resolve("eslint");
    parserEntry = projectRequire.resolve("@typescript-eslint/parser");
  } catch { throw new Error(`TOOLCHAIN_MISSING:${root}: run npm ci in the artifact root`); }
  const eslintModule = await import(pathToFileURL(eslintEntry));
  const parserModule = await import(pathToFileURL(parserEntry));
  const ESLint = eslintModule.ESLint ?? eslintModule.default?.ESLint;
  if (typeof ESLint !== "function") throw new Error("UNSUPPORTED_TOOLCHAIN: ESLint API unavailable");
  const eslint = new ESLint({ cwd: root, ignore: false, overrideConfigFile: true, overrideConfig: createPreset({ parser: parserModule.default ?? parserModule }) });
  const results = await eslint.lintFiles(process.argv.slice(3).length > 0 ? process.argv.slice(3) : ["src/slides/*.ts"]);
  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);
  if (output) process.stdout.write(output);
  if (results.some(({ errorCount, fatalErrorCount }) => errorCount > 0 || fatalErrorCount > 0)) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`[pptx-project-lint] ${error.message}\n`); process.exitCode = 2; });

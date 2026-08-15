#!/usr/bin/env node

import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPreset } from "../../lib/eslint/preset.js";
import { assertVideoProjectRoot } from "../../lib/writer.js";

async function main() {
  const root = assertVideoProjectRoot(resolve(process.argv[2] ?? ""));
  const requested = process.argv.slice(3);
  if (requested.some((filePath) => !/^src\/visual\/(?:\*|[a-z0-9][a-z0-9.-]*)\.tsx$/u.test(filePath))) throw new Error("LINT_TARGET_OUT_OF_SCOPE");
  const projectRequire = createRequire(join(root, "package.json"));
  let eslintEntry;
  let parserEntry;
  try { eslintEntry = projectRequire.resolve("eslint"); parserEntry = projectRequire.resolve("@typescript-eslint/parser"); }
  catch { throw new Error(`TOOLCHAIN_MISSING:${root}: run npm ci in the artifact root`); }
  const eslintModule = await import(pathToFileURL(eslintEntry));
  const parserModule = await import(pathToFileURL(parserEntry));
  const ESLint = eslintModule.ESLint ?? eslintModule.default?.ESLint;
  if (typeof ESLint !== "function") throw new Error("UNSUPPORTED_TOOLCHAIN: ESLint API unavailable");
  const eslint = new ESLint({ cwd: root, ignore: false, overrideConfigFile: true, overrideConfig: createPreset({ parser: parserModule.default ?? parserModule }) });
  const results = await eslint.lintFiles(requested.length > 0 ? requested : ["src/visual/*.tsx"]);
  const output = (await eslint.loadFormatter("stylish")).format(results);
  if (output) process.stdout.write(output);
  if (results.some(({ errorCount, fatalErrorCount }) => errorCount > 0 || fatalErrorCount > 0)) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`[video-project-lint] ${error.message}\n`); process.exitCode = 2; });

// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba

// core/src/eslint-local-runner.ts
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
async function runLocalEslint(options) {
  const root = resolve(options.root);
  const projectRequire = createRequire(join(root, "package.json"));
  let eslintEntry;
  let parserEntry;
  try {
    eslintEntry = projectRequire.resolve("eslint");
    parserEntry = projectRequire.resolve("@typescript-eslint/parser");
  } catch {
    throw new Error(`TOOLCHAIN_MISSING:${root}: run npm ci in the artifact root`);
  }
  const eslintModule = await import(pathToFileURL(eslintEntry).href);
  const parserModule = await import(pathToFileURL(parserEntry).href);
  const ESLint = eslintModule.ESLint ?? eslintModule.default?.ESLint;
  if (typeof ESLint !== "function") throw new Error("UNSUPPORTED_TOOLCHAIN: ESLint API unavailable");
  const preset = typeof options.preset === "function" ? options.preset({ parser: parserModule.default ?? parserModule }) : options.preset;
  const eslint = new ESLint({ cwd: root, ignore: false, overrideConfigFile: true, overrideConfig: preset });
  const files = (options.extraFiles?.length ?? 0) > 0 ? options.extraFiles ?? [] : options.defaultFiles;
  const results = await eslint.lintFiles(files);
  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);
  const failed = results.some(({ errorCount, fatalErrorCount }) => errorCount > 0 || fatalErrorCount > 0);
  return { output, failed };
}

export {
  runLocalEslint
};

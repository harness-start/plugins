import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runLocalEslint(options: {
  root: string;
  preset: unknown;
  defaultFiles: string[];
  extraFiles?: string[];
}): Promise<{ output: string; failed: boolean }> {
  const root = resolve(options.root);
  const projectRequire = createRequire(join(root, "package.json"));
  let eslintEntry: string;
  let parserEntry: string;
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
  const preset = typeof options.preset === "function"
    ? options.preset({ parser: parserModule.default ?? parserModule })
    : options.preset;
  const eslint = new ESLint({ cwd: root, ignore: false, overrideConfigFile: true, overrideConfig: preset });
  const files = (options.extraFiles?.length ?? 0) > 0 ? options.extraFiles ?? [] : options.defaultFiles;
  const results = await eslint.lintFiles(files);
  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);
  const failed = results.some(({ errorCount, fatalErrorCount }: { errorCount: number; fatalErrorCount: number }) => errorCount > 0 || fatalErrorCount > 0);
  return { output, failed };
}
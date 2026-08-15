#!/usr/bin/env node
// harness-source-hash: sha256:895038fec6d7fa3f86b941271caa36da0b966a4497e87dff078416e36fdb9509

// plugins/print-publication-delivery-guard/src/entries/cli/project-lint.ts
import { resolve as resolve2 } from "node:path";

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

// plugins/print-publication-delivery-guard/src/lib/eslint/local-rules/artifact-unit-owner.ts
var artifact_unit_owner_default = {
  meta: { type: "problem", schema: [], messages: { static: "Publication units must be static React without client runtime, I/O, network, or nondeterminism.", export: "A publication unit must export exactly one component." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration") exports += 1;
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["useState", "useEffect", "useLayoutEffect", "useReducer", "hydrateRoot", "createRoot", "createPortal", "fetch", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "static" });
      },
      "Program:exit"(node) {
        if (exports !== 1) context.report({ node, messageId: "export" });
      }
    };
  }
};

// plugins/print-publication-delivery-guard/src/lib/eslint/preset.ts
function createPreset({ parser }) {
  return [{
    files: ["src/{sections,cover}/*.tsx"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "artifact-guard": { rules: { "artifact-unit-owner": artifact_unit_owner_default } } },
    rules: {
      "artifact-guard/artifact-unit-owner": "error",
      "no-restricted-globals": ["error", "fetch", "setTimeout", "setInterval"],
      "no-restricted-imports": ["error", { patterns: ["node:fs*", "node:child_process", "react-router", "react-router-dom"] }]
    }
  }];
}

// plugins/print-publication-delivery-guard/src/entries/cli/project-lint.ts
async function main() {
  const { output, failed } = await runLocalEslint({
    root: resolve2(process.argv[2] ?? ""),
    preset: createPreset,
    defaultFiles: ["src/{sections,cover}/*.tsx"],
    extraFiles: process.argv.slice(3)
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}
main().catch((error) => {
  process.stderr.write(`[print-project-lint] ${error.message}
`);
  process.exitCode = 2;
});

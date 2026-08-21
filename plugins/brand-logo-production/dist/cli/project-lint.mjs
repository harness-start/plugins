#!/usr/bin/env node
// harness-source-hash: sha256:c633e514c8b6e22889b72b5d0d4eb8e6d1c8e9b4d53f21168e1cfdc3f8bbf728
import {
  assertLogoProjectRoot
} from "../chunks/chunk-CZ3JICN3.mjs";

// plugins/brand-logo-production/src/entries/cli/project-lint.ts
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

// plugins/brand-logo-production/src/lib/eslint/local-rules/artifact-unit-owner.ts
var jsxName = (node) => {
  const name = node.name;
  if (name && typeof name === "object") return name.name;
  return name;
};
var rule = {
  meta: { type: "problem", schema: [], messages: { vector: "Logo master modules must remain self-contained native SVG vectors.", export: "A logo master module must export exactly one component." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration") exports += 1;
      },
      JSXOpeningElement(node) {
        if (["image", "text", "foreignObject", "script", "style", "iframe"].includes(String(jsxName(node)))) context.report({ node, messageId: "vector" });
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (name !== void 0 && ["fetch", "useState", "useEffect", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "vector" });
      },
      "Program:exit"(node) {
        if (exports !== 1) context.report({ node, messageId: "export" });
      }
    };
  }
};
var artifact_unit_owner_default = rule;

// plugins/brand-logo-production/src/lib/eslint/preset.ts
function createPreset({ parser }) {
  return [{
    files: ["src/master/*.logo.tsx"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "artifact-guard": { rules: { "artifact-unit-owner": artifact_unit_owner_default } } },
    rules: {
      "artifact-guard/artifact-unit-owner": "error",
      "no-restricted-globals": ["error", "fetch", "setTimeout", "setInterval"],
      "no-restricted-imports": ["error", { patterns: ["node:fs*", "node:child_process"] }]
    }
  }];
}

// plugins/brand-logo-production/src/entries/cli/project-lint.ts
async function main() {
  const root = resolve2(process.argv[2] ?? "");
  await assertLogoProjectRoot(root);
  const { output, failed } = await runLocalEslint({
    root,
    preset: createPreset,
    defaultFiles: ["src/master/*.logo.tsx"],
    extraFiles: process.argv.slice(3)
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}
main().catch((error) => {
  process.stderr.write(`[logo-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

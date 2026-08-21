#!/usr/bin/env node
// harness-source-hash: sha256:4792ccc1b9044e92c456d58e726eba93109c87c0a770ee992bb4fe82738cdc0a
import {
  assertVideoProjectRoot
} from "../chunks/chunk-EQU7CLGR.mjs";

// plugins/video-production/src/entries/cli/project-lint.ts
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

// plugins/video-production/src/lib/eslint/local-rules/artifact-unit-owner.ts
var jsxName = (node) => typeof node.name === "object" && node.name !== null ? node.name.name : node.name;
var FORBIDDEN_REMOTION_IMPORTS = /* @__PURE__ */ new Set(["Audio", "Composition", "Sequence", "Series", "TransitionSeries"]);
function report(context, node) {
  context.report({ node, messageId: "owner" });
}
var artifact_unit_owner_default = {
  meta: { type: "problem", schema: [], messages: { owner: "A visual unit may not own audio, composition, global scheduling, I/O, network, or wall-clock randomness." } },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source?.value;
        if (source === "@remotion/renderer" || /^node:(?:fs|child_process)$/u.test(typeof source === "string" ? source : "")) report(context, node);
        if (source === "remotion" && node.specifiers?.some((specifier) => specifier.type === "ImportNamespaceSpecifier" || FORBIDDEN_REMOTION_IMPORTS.has(specifier.imported?.name ?? ""))) report(context, node);
      },
      ImportExpression(node) {
        const source = node.source?.value;
        if (typeof source === "string" && ["@remotion/renderer", "node:fs", "node:child_process"].includes(source)) report(context, node);
      },
      JSXOpeningElement(node) {
        const name = jsxName(node);
        if (typeof name === "string" && FORBIDDEN_REMOTION_IMPORTS.has(name)) report(context, node);
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (typeof name === "string" && ["fetch", "setTimeout", "setInterval", "random"].includes(name)) report(context, node);
      },
      NewExpression(node) {
        const name = node.callee?.name;
        if (typeof name === "string" && ["XMLHttpRequest", "WebSocket"].includes(name)) report(context, node);
      }
    };
  }
};

// plugins/video-production/src/lib/eslint/preset.ts
function createPreset({ parser }) {
  return [{
    files: ["src/visual/*.tsx"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "artifact-guard": { rules: { "artifact-unit-owner": artifact_unit_owner_default } } },
    rules: {
      "artifact-guard/artifact-unit-owner": "error",
      "no-restricted-globals": ["error", "fetch", "setTimeout", "setInterval"],
      "no-restricted-imports": ["error", { patterns: ["node:fs*", "node:child_process", "@remotion/renderer"] }]
    }
  }];
}

// plugins/video-production/src/entries/cli/project-lint.ts
async function main() {
  const root = assertVideoProjectRoot(resolve2(process.argv[2] ?? ""));
  const requested = process.argv.slice(3);
  if (requested.some((filePath) => !/^src\/visual\/(?:\*|[a-z0-9][a-z0-9.-]*)\.tsx$/u.test(filePath))) throw new Error("LINT_TARGET_OUT_OF_SCOPE");
  const { output, failed } = await runLocalEslint({
    root,
    preset: createPreset,
    defaultFiles: ["src/visual/*.tsx"],
    extraFiles: requested
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-lint] ${message}
`);
  process.exitCode = 2;
});

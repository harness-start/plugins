#!/usr/bin/env node
// harness-source-hash: sha256:db6acf67eecce56c01c80da3a791b57505c2dce49e2dfa3fb4248a9969f97567
import {
  assertVideoProjectRoot
} from "../chunks/chunk-EM577HQ5.mjs";

// plugins/video-project-delivery-guard/src/entries/cli/project-lint.ts
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

// plugins/video-project-delivery-guard/src/lib/eslint/local-rules/artifact-unit-owner.ts
var jsxName = (node) => node?.name?.name ?? node?.name;
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
        if (source === "@remotion/renderer" || /^node:(?:fs|child_process)$/u.test(source ?? "")) report(context, node);
        if (source === "remotion" && node.specifiers?.some((specifier) => specifier.type === "ImportNamespaceSpecifier" || FORBIDDEN_REMOTION_IMPORTS.has(specifier.imported?.name))) report(context, node);
      },
      ImportExpression(node) {
        if (["@remotion/renderer", "node:fs", "node:child_process"].includes(node.source?.value)) report(context, node);
      },
      JSXOpeningElement(node) {
        if (FORBIDDEN_REMOTION_IMPORTS.has(jsxName(node))) report(context, node);
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["fetch", "setTimeout", "setInterval", "random"].includes(name)) report(context, node);
      },
      NewExpression(node) {
        if (["XMLHttpRequest", "WebSocket"].includes(node.callee?.name)) report(context, node);
      }
    };
  }
};

// plugins/video-project-delivery-guard/src/lib/eslint/preset.ts
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

// plugins/video-project-delivery-guard/src/entries/cli/project-lint.ts
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
  process.stderr.write(`[video-project-lint] ${error.message}
`);
  process.exitCode = 2;
});

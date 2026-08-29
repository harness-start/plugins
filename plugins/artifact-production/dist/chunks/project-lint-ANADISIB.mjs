#!/usr/bin/env node
// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba
import {
  runLocalEslint
} from "./chunk-XTKY6N35.mjs";
import {
  assertVideoProjectRoot
} from "./chunk-6WUDJSJF.mjs";
import "./chunk-NNXJRIQT.mjs";

// plugins/artifact-production/src/domains/video/entries/cli/project-lint.ts
import { resolve } from "node:path";

// plugins/artifact-production/src/domains/video/lib/eslint/local-rules/artifact-unit-owner.ts
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

// plugins/artifact-production/src/domains/video/lib/eslint/preset.ts
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

// plugins/artifact-production/src/domains/video/entries/cli/project-lint.ts
async function main() {
  const root = assertVideoProjectRoot(resolve(process.argv[2] ?? ""));
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
await main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-lint] ${message}
`);
  process.exitCode = 2;
});

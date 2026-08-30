#!/usr/bin/env node
// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  runLocalEslint
} from "./chunk-CSZYQBW6.mjs";
import {
  assertLogoProjectRoot
} from "./chunk-XKBJTIMM.mjs";
import "./chunk-QTVEXSL5.mjs";

// plugins/artifact-production/src/domains/logo/entries/cli/project-lint.ts
import { resolve } from "node:path";

// plugins/artifact-production/src/domains/logo/lib/eslint/local-rules/artifact-unit-owner.ts
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

// plugins/artifact-production/src/domains/logo/lib/eslint/preset.ts
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

// plugins/artifact-production/src/domains/logo/entries/cli/project-lint.ts
async function main() {
  const root = resolve(process.argv[2] ?? "");
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
await main().catch((error) => {
  process.stderr.write(`[logo-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

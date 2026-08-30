#!/usr/bin/env node
// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  runLocalEslint
} from "./chunk-CSZYQBW6.mjs";
import "./chunk-QTVEXSL5.mjs";

// plugins/artifact-production/src/domains/print/entries/cli/project-lint.ts
import { resolve } from "node:path";

// plugins/artifact-production/src/domains/print/lib/eslint/local-rules/artifact-unit-owner.ts
var rule = {
  meta: { type: "problem", schema: [], messages: { static: "Publication units must be static React without client runtime, I/O, network, or nondeterminism.", export: "A publication unit must export exactly one component." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration") exports += 1;
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (name !== void 0 && ["useState", "useEffect", "useLayoutEffect", "useReducer", "hydrateRoot", "createRoot", "createPortal", "fetch", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "static" });
      },
      "Program:exit"(node) {
        if (exports !== 1) context.report({ node, messageId: "export" });
      }
    };
  }
};
var artifact_unit_owner_default = rule;

// plugins/artifact-production/src/domains/print/lib/eslint/preset.ts
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

// plugins/artifact-production/src/domains/print/entries/cli/project-lint.ts
async function main() {
  const { output, failed } = await runLocalEslint({
    root: resolve(process.argv[2] ?? ""),
    preset: createPreset,
    defaultFiles: ["src/{sections,cover}/*.tsx"],
    extraFiles: process.argv.slice(3)
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}
await main().catch((error) => {
  process.stderr.write(`[print-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

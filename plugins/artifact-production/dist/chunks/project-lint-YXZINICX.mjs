#!/usr/bin/env node
// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba
import {
  runLocalEslint
} from "./chunk-XTKY6N35.mjs";
import {
  assertPosterProjectRoot,
  loadPosterProject,
  validatePosterModel
} from "./chunk-CCAWDHHY.mjs";
import "./chunk-7REKS3VS.mjs";
import "./chunk-NNXJRIQT.mjs";

// plugins/artifact-production/src/domains/poster/lib/eslint/local-rules/artifact-unit-owner.ts
var rule = {
  meta: { type: "problem", schema: [], messages: { owner: "A poster layer may not own stacking, rendering, I/O, network, or runtime hooks.", export: "A poster layer must export exactly one buildLayer function." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id?.name === "buildLayer") exports += 1;
      },
      Property(node) {
        if ((node.key?.name ?? node.key?.value) === "zIndex") context.report({ node, messageId: "owner" });
      },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (name !== void 0 && ["fetch", "setTimeout", "setInterval", "useState", "useEffect", "useLayoutEffect"].includes(name)) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node) {
        if (exports !== 1) context.report({ node, messageId: "export" });
      }
    };
  }
};
var artifact_unit_owner_default = rule;

// plugins/artifact-production/src/domains/poster/lib/eslint/preset.ts
function createPreset({ parser }) {
  return [{
    files: ["src/variants/*/layers/*.tsx"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "artifact-guard": { rules: { "artifact-unit-owner": artifact_unit_owner_default } } },
    rules: {
      "artifact-guard/artifact-unit-owner": "error",
      "no-restricted-globals": ["error", "fetch", "setTimeout", "setInterval"],
      "no-restricted-imports": ["error", { patterns: ["node:fs*", "node:child_process", "satori", "@resvg/*"] }]
    }
  }];
}

// plugins/artifact-production/src/domains/poster/entries/cli/project-lint.ts
async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const model = await loadPosterProject(root);
  const findings = validatePosterModel(model, { stage: "source" });
  if (findings.length) {
    process.stderr.write(`${findings.map(({ code, path, message }) => `${path} [${code}] ${message}`).join("\n")}
`);
    process.exitCode = 2;
    return;
  }
  const { output, failed } = await runLocalEslint({ root, preset: createPreset, defaultFiles: ["src/variants/*/layers/*.tsx"], extraFiles: [] });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}
await main().catch((error) => {
  process.stderr.write(`[poster-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

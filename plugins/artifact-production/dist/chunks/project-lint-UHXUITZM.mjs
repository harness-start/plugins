#!/usr/bin/env node
// harness-source-hash: sha256:0c811d66170e751d4c95f49bfca01deb84cbe9025b35ec552ae2ab9dd9de90a7
import {
  runLocalEslint
} from "./chunk-NT7SJDS3.mjs";
import {
  loadPptxProject,
  validatePptxModel
} from "./chunk-FRFDXTK3.mjs";
import "./chunk-JEFE65OS.mjs";
import "./chunk-RIYLCIXM.mjs";
import "./chunk-DL3TI7GO.mjs";
import "./chunk-4DTUINPK.mjs";

// plugins/artifact-production/src/domains/presentation/entries/cli/project-lint.ts
import { resolve } from "node:path";

// plugins/artifact-production/src/domains/presentation/lib/eslint/local-rules/artifact-unit-owner.ts
var nameOf = (callee) => callee?.type === "Identifier" ? callee.name : callee?.property?.name;
var rule = {
  meta: { type: "problem", schema: [], messages: { owner: "A slide module may only export renderSlide and may not create decks, slides, files, or network effects.", export: "A slide module must export exactly one renderSlide function." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id?.name === "renderSlide") exports += 1;
      },
      CallExpression(node) {
        const name = nameOf(node.callee);
        if (name !== void 0 && ["addSlide", "writeFile", "writeFileSync", "createWriteStream", "fetch", "setTimeout", "setInterval"].includes(name)) context.report({ node, messageId: "owner" });
      },
      NewExpression(node) {
        const name = nameOf(node.callee);
        if (name !== void 0 && ["pptxgen", "PptxGenJS"].includes(name)) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node) {
        if (exports !== 1) context.report({ node, messageId: "export" });
      }
    };
  }
};
var artifact_unit_owner_default = rule;

// plugins/artifact-production/src/domains/presentation/lib/eslint/preset.ts
function createPreset({ parser }) {
  return [{
    files: ["src/slides/*.ts"],
    languageOptions: { parser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "artifact-guard": { rules: { "artifact-unit-owner": artifact_unit_owner_default } } },
    rules: {
      "artifact-guard/artifact-unit-owner": "error",
      "no-restricted-globals": ["error", "fetch", "setTimeout", "setInterval"],
      "no-restricted-imports": ["error", { patterns: ["node:fs*", "node:child_process", "pptxgenjs"] }]
    }
  }];
}

// plugins/artifact-production/src/domains/presentation/entries/cli/project-lint.ts
async function main() {
  const root = resolve(process.argv[2] ?? "");
  const model = await loadPptxProject(root);
  const findings = validatePptxModel(model, { stage: "source" });
  if (findings.length > 0) {
    process.stderr.write(`${findings.map(({ code, path, message }) => `${code}:${path}:${message}`).join("\n")}
`);
    process.exitCode = 2;
    return;
  }
  const { output, failed } = await runLocalEslint({
    root,
    preset: createPreset,
    defaultFiles: ["src/slides/*.ts"],
    extraFiles: process.argv.slice(3)
  });
  if (output) process.stdout.write(output);
  if (failed) process.exitCode = 2;
}
await main().catch((error) => {
  process.stderr.write(`[pptx-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

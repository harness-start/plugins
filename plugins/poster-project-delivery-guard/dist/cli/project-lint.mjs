#!/usr/bin/env node

// plugins/poster-project-delivery-guard/src/entries/cli/project-lint.ts
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/poster-project-delivery-guard/src/lib/eslint/local-rules/artifact-unit-owner.ts
var artifact_unit_owner_default = {
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
        if (["fetch", "setTimeout", "setInterval", "useState", "useEffect", "useLayoutEffect"].includes(name)) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node) {
        if (exports !== 1) context.report({ node, messageId: "export" });
      }
    };
  }
};

// plugins/poster-project-delivery-guard/src/lib/eslint/preset.ts
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

// plugins/poster-project-delivery-guard/src/entries/cli/project-lint.ts
async function main() {
  const root = resolve(process.argv[2] ?? "");
  const projectRequire = createRequire(join(root, "package.json"));
  let eslintEntry;
  let parserEntry;
  try {
    eslintEntry = projectRequire.resolve("eslint");
    parserEntry = projectRequire.resolve("@typescript-eslint/parser");
  } catch {
    throw new Error(`TOOLCHAIN_MISSING:${root}: run npm ci in the artifact root`);
  }
  const eslintModule = await import(pathToFileURL(eslintEntry));
  const parserModule = await import(pathToFileURL(parserEntry));
  const ESLint = eslintModule.ESLint ?? eslintModule.default?.ESLint;
  if (typeof ESLint !== "function") throw new Error("UNSUPPORTED_TOOLCHAIN: ESLint API unavailable");
  const eslint = new ESLint({ cwd: root, ignore: false, overrideConfigFile: true, overrideConfig: createPreset({ parser: parserModule.default ?? parserModule }) });
  const results = await eslint.lintFiles(process.argv.slice(3).length > 0 ? process.argv.slice(3) : ["src/variants/*/layers/*.tsx"]);
  const output = (await eslint.loadFormatter("stylish")).format(results);
  if (output) process.stdout.write(output);
  if (results.some(({ errorCount, fatalErrorCount }) => errorCount > 0 || fatalErrorCount > 0)) process.exitCode = 2;
}
main().catch((error) => {
  process.stderr.write(`[poster-project-lint] ${error.message}
`);
  process.exitCode = 2;
});

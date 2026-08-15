import ownerRule from "./local-rules/artifact-unit-owner.js";

export function createPreset({ parser }) {
  return [{
    files: ["src/slides/*.ts"],
    languageOptions: { parser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "artifact-guard": { rules: { "artifact-unit-owner": ownerRule } } },
    rules: {
      "artifact-guard/artifact-unit-owner": "error",
      "no-restricted-globals": ["error", "fetch", "setTimeout", "setInterval"],
      "no-restricted-imports": ["error", { patterns: ["node:fs*", "node:child_process", "pptxgenjs"] }],
    },
  }];
}

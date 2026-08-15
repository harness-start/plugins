import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/acceptance/**",
      "plugins/**/*.mjs",
      ".acceptance-runs/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
      }],
      "no-control-regex": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
  {
    files: ["**/tests/**/*.ts"],
    rules: {
      "no-useless-escape": "off",
    },
  },
);

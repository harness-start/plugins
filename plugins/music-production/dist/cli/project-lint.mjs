#!/usr/bin/env node
// harness-source-hash: sha256:270295f6dc4c44f7fd0084a824f37ca0fc45d0d63c0e4317eae40b7886d899f8
import {
  loadCompositionDeterministic,
  optimizeComposition
} from "../chunks/chunk-NRMECBJT.mjs";
import {
  collectMusicModel
} from "../chunks/chunk-YJA6A3I4.mjs";
import {
  validateMusicModel
} from "../chunks/chunk-NMHJTGBI.mjs";

// plugins/music-production/src/entries/cli/project-lint.ts
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/music-production/src/lib/eslint/local-rules/music-ownership.ts
var forbidden = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\(\))/u;
var music_ownership_default = {
  meta: { type: "problem", schema: [], messages: { forbidden: "Composition and instrument modules may not own network, wall-clock, randomness, transport, or offline rendering." } },
  create(context) {
    return {
      Program(node) {
        if (forbidden.test(context.sourceCode.text)) context.report({ node, messageId: "forbidden" });
      }
    };
  }
};

// plugins/music-production/src/lib/eslint/preset.ts
var preset_default = [{
  files: ["src/**/*.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: { "tonejs-music": { rules: { "music-ownership": music_ownership_default } } },
  rules: { "tonejs-music/music-ownership": "error" }
}];

// plugins/music-production/src/entries/cli/project-lint.ts
async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const model = await collectMusicModel(root);
  const findings = validateMusicModel(model, { stage: "design" });
  optimizeComposition(await loadCompositionDeterministic(root));
  const require2 = createRequire(join(root, "package.json"));
  const loaded = await import(pathToFileURL(require2.resolve("eslint")).href);
  const { ESLint } = loaded.default ?? loaded;
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: preset_default });
  const results = await eslint.lintFiles(["src/**/*.mjs"]);
  for (const result of results) {
    for (const message of result.messages) findings.push({ code: message.ruleId ?? "ESLINT", path: `${result.filePath}:${message.line}:${message.column}`, message: message.message });
  }
  if (findings.length > 0) {
    const first = findings[0];
    throw new Error(`${first?.code}:${first?.path}:${first?.message}`);
  }
  process.stdout.write(`${JSON.stringify({ valid: true, files: results.length })}
`);
}
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-lint] ${message}
`);
  process.exitCode = 2;
});

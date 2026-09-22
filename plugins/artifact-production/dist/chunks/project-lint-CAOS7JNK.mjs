#!/usr/bin/env node
// harness-source-hash: sha256:253573a0f3bd6ecb6a919d8e9ce5b3cd54c5fb70cc95b2a32088d75ee36cc981
import {
  loadCompositionDeterministic,
  optimizeComposition
} from "./chunk-MMYNFC4W.mjs";
import {
  collectMusicModel
} from "./chunk-5JKTV5S2.mjs";
import {
  validateMusicModel
} from "./chunk-UV3UK4BX.mjs";
import "./chunk-VHWSRWTZ.mjs";
import "./chunk-ACZGLWAJ.mjs";

// plugins/artifact-production/src/domains/music/entries/cli/project-lint.ts
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/artifact-production/src/domains/music/lib/eslint/local-rules/music-ownership.ts
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

// plugins/artifact-production/src/domains/music/lib/eslint/preset.ts
var preset_default = [{
  files: ["src/**/*.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: { "tonejs-music": { rules: { "music-ownership": music_ownership_default } } },
  rules: { "tonejs-music/music-ownership": "error" }
}];

// plugins/artifact-production/src/domains/music/entries/cli/project-lint.ts
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
await main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-lint] ${message}
`);
  process.exitCode = 2;
});

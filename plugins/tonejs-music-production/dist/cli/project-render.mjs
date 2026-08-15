#!/usr/bin/env node
// harness-source-hash: sha256:2e06468278cd853b202d164627aec70cd7bf251a27eb226740a171c4796ca45d
import {
  createToneBrowserRenderer,
  renderProject
} from "../chunks/chunk-H76SYOQC.mjs";
import "../chunks/chunk-PUICJHET.mjs";
import "../chunks/chunk-35CEFHQA.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-render.ts
import { resolve } from "node:path";
var root = resolve(process.argv[2] ?? process.cwd());
renderProject({ root, renderAudio: createToneBrowserRenderer() }).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-render] ${error.message}
`);
  process.exitCode = 2;
});

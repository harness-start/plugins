#!/usr/bin/env node
// harness-source-hash: sha256:e0f6fc4e3c04b0fb623a8f33f43d3fea1e43b13c1907459289458fcd4c538788
import {
  createToneBrowserRenderer,
  renderProject
} from "../chunks/chunk-D3VGACE2.mjs";
import "../chunks/chunk-CU3JXZWU.mjs";
import "../chunks/chunk-GR7SWMK5.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-render.ts
import { resolve } from "node:path";
var root = resolve(process.argv[2] ?? process.cwd());
renderProject({ root, renderAudio: createToneBrowserRenderer() }).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-render] ${error.message}
`);
  process.exitCode = 2;
});

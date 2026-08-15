#!/usr/bin/env node
// harness-source-hash: sha256:365857310e834149df95196ac7e040f83521b5c0e6ffc6bc25069911ae9a8f80
import {
  createToneBrowserRenderer,
  renderProject
} from "../chunks/chunk-SQ2ESXKQ.mjs";
import "../chunks/chunk-ZEIB74IQ.mjs";
import "../chunks/chunk-4EU6XMSF.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-render.ts
import { resolve } from "node:path";
var root = resolve(process.argv[2] ?? process.cwd());
renderProject({ root, renderAudio: createToneBrowserRenderer() }).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-render] ${error.message}
`);
  process.exitCode = 2;
});

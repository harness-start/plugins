#!/usr/bin/env node
import {
  createToneBrowserRenderer,
  renderProject
} from "../chunks/chunk-AMYI57AO.mjs";
import "../chunks/chunk-XAHQWE2J.mjs";
import "../chunks/chunk-62TCAD7O.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-render.ts
import { resolve } from "node:path";
var root = resolve(process.argv[2] ?? process.cwd());
renderProject({ root, renderAudio: createToneBrowserRenderer() }).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-render] ${error.message}
`);
  process.exitCode = 2;
});

#!/usr/bin/env node
// harness-source-hash: sha256:f39458424842356a20167de1a7109c0fb792bb5e954cf4b9eb7faaa6aa35f2fa
import {
  createToneBrowserRenderer,
  renderProject
} from "../chunks/chunk-QSQKEF2J.mjs";
import "../chunks/chunk-CK3DV5VG.mjs";
import "../chunks/chunk-XYNVSRBJ.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-render.ts
import { resolve } from "node:path";
var root = resolve(process.argv[2] ?? process.cwd());
renderProject({ root, renderAudio: createToneBrowserRenderer() }).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-render] ${error.message}
`);
  process.exitCode = 2;
});

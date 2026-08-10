#!/usr/bin/env node

import { resolve } from "node:path";

import { createToneBrowserRenderer } from "../lib/browser-renderer.mjs";
import { renderProject } from "../lib/renderer.mjs";

const root = resolve(process.argv[2] ?? process.cwd());

renderProject({ root, renderAudio: createToneBrowserRenderer() })
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error) => {
    process.stderr.write(`[tonejs-music-render] ${error.message}\n`);
    process.exitCode = 2;
  });

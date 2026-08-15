#!/usr/bin/env node

import { resolve } from "node:path";

import { createToneBrowserRenderer } from "../../lib/browser-renderer.js";
import { renderProject } from "../../lib/renderer.js";

const root = resolve(process.argv[2] ?? process.cwd());

renderProject({ root, renderAudio: createToneBrowserRenderer() })
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[tonejs-music-render] ${message}\n`);
    process.exitCode = 2;
  });

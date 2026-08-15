#!/usr/bin/env node

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createToneBrowserRenderer } from "../../lib/browser-renderer.js";
import { renderProject } from "../../lib/renderer.js";

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const rendered = await renderProject({ root, renderAudio: createToneBrowserRenderer() });
  const wav = await readFile(rendered.mixPath);
  const server = createServer((request, response) => {
    if (request.url === "/mix.wav") {
      response.writeHead(200, { "content-type": "audio/wav", "content-length": wav.length, "cache-control": "no-store" });
      response.end(wav);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><meta charset=utf-8><title>Tone.js Music Preview</title><style>body{font:16px system-ui;max-width:42rem;margin:10vh auto;padding:2rem;background:#111;color:#eee}audio{width:100%}</style><h1>Tone.js Music Preview</h1><p>Digest-bound offline render</p><audio controls autoplay src=/mix.wav></audio>");
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const require = createRequire(join(root, "package.json"));
  const loaded = await import(pathToFileURL(require.resolve("playwright")).href);
  const { chromium } = loaded.default ?? loaded;
  const browser = await chromium.launch({ headless: false });
  await browser.newPage().then((page) => page.goto(`http://127.0.0.1:${address.port}`));
  process.stdout.write(`Previewing ${rendered.mixPath}; close the browser to stop.\n`);
  await new Promise((resolvePromise) => browser.on("disconnected", resolvePromise));
  server.close();
}

main().catch((error) => {
  process.stderr.write(`[tonejs-music-preview] ${error.message}\n`);
  process.exitCode = 2;
});

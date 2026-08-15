#!/usr/bin/env node
// harness-source-hash: sha256:e523627cdb7cb90c4b1de7893c3cb0a39eae8bc7828023ba764a1067ac2d9844
import {
  createToneBrowserRenderer,
  renderProject
} from "../chunks/chunk-4BUMF6NC.mjs";
import "../chunks/chunk-B3UIGL2A.mjs";
import "../chunks/chunk-6UVSZ5EF.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-preview.ts
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  await new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("PREVIEW_ADDRESS_INVALID");
  const { port } = address;
  const require2 = createRequire(join(root, "package.json"));
  const loaded = await import(pathToFileURL(require2.resolve("playwright")).href);
  const playwright = typeof loaded === "object" && loaded !== null && "default" in loaded && loaded.default ? loaded.default : loaded;
  const chromium = typeof playwright === "object" && playwright !== null && "chromium" in playwright ? playwright.chromium : void 0;
  if (!chromium) throw new Error("PLAYWRIGHT_UNAVAILABLE");
  const browser = await chromium.launch({ headless: false });
  await browser.newPage().then((page) => page.goto(`http://127.0.0.1:${port}`));
  process.stdout.write(`Previewing ${rendered.mixPath}; close the browser to stop.
`);
  await new Promise((resolvePromise) => {
    browser.on("disconnected", resolvePromise);
  });
  server.close();
}
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[tonejs-music-preview] ${message}
`);
  process.exitCode = 2;
});

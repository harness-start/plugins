#!/usr/bin/env node

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("PREVIEW_ADDRESS_INVALID");
  const { port } = address as AddressInfo;
  const require = createRequire(join(root, "package.json"));
  const loaded: unknown = await import(pathToFileURL(require.resolve("playwright")).href);
  const playwright = typeof loaded === "object" && loaded !== null && "default" in loaded && loaded.default ? loaded.default : loaded;
  const chromium = typeof playwright === "object" && playwright !== null && "chromium" in playwright
    ? (playwright as { chromium: { launch: (options: { headless: boolean }) => Promise<{
      newPage: () => Promise<{ goto: (url: string) => Promise<unknown> }>;
      on: (event: "disconnected", listener: () => void) => unknown;
    }> } }).chromium
    : undefined;
  if (!chromium) throw new Error("PLAYWRIGHT_UNAVAILABLE");
  const browser = await chromium.launch({ headless: false });
  await browser.newPage().then((page) => page.goto(`http://127.0.0.1:${port}`));
  process.stdout.write(`Previewing ${rendered.mixPath}; close the browser to stop.\n`);
  await new Promise<void>((resolvePromise) => {
    browser.on("disconnected", resolvePromise);
  });
  server.close();
}

main().catch((error: unknown) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[tonejs-music-preview] ${message}\n`);
  process.exitCode = 2;
});

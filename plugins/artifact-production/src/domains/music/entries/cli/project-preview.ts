#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { consumeMusicWriterCapability, processMusicWriterArgv } from "../../lib/capability.js";
import { PREVIEW_SCHEMA, computeMusicSubjectDigest, musicSourcePaths } from "../../lib/contract.js";
import { collectMusicModel } from "../../lib/release.js";
import { analyzePcm16Wav } from "../../lib/wav.js";
import { atomicWriteMusicJson, musicSessionMetadata, withMusicJournal } from "../../lib/writer.js";

const sha256 = (value: NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const grant = await consumeMusicWriterCapability({ root, capability: "music-preview", argv: processMusicWriterArgv() });
  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest) throw new Error("WRITER_SUBJECT_CHANGED");
  const paths = musicSourcePaths(model);
  const render = JSON.parse(model.files?.[paths.renderReceipt] ?? "null") as Record<string, unknown>;
  if (render.schema !== "tonejs-render-receipt/v1" || render.sourceDigest !== subjectDigest) throw new Error("CURRENT_RENDER_REQUIRED");
  const mixPath = join(root, paths.mix);
  const mix = await readFile(mixPath);
  const stems: Record<string, string> = {};
  const analysis: Record<string, unknown> = { [paths.mix]: analyzePcm16Wav(mix) };
  for (const stemPath of paths.proofs) {
    const stem = await readFile(join(root, stemPath));
    stems[stemPath] = sha256(stem);
    analysis[stemPath] = analyzePcm16Wav(stem);
  }
  const preview = {
    schema: PREVIEW_SCHEMA,
    plugin: "music-production",
    artifactId: model.artifactId,
    subjectDigest,
    renderReceiptSha256: model.digests?.[paths.renderReceipt],
    mixPath: paths.mix,
    mixSha256: sha256(mix),
    stems,
    analysis,
    attestation: "made-available-for-audition-not-proof-of-listening",
    ...musicSessionMetadata("music-preview", grant),
  };
  await withMusicJournal(root, "music-preview", grant, () => atomicWriteMusicJson(root, paths.preview, preview));
  if (process.argv.includes("--evidence-only")) {
    process.stdout.write(`${JSON.stringify({ previewPath: paths.preview, subjectDigest })}\n`);
    return;
  }

  const server = createServer((request, response) => {
    if (request.url === "/mix.wav") {
      response.writeHead(200, { "content-type": "audio/wav", "content-length": mix.length, "cache-control": "no-store" });
      response.end(mix);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><meta charset=utf-8><title>Music Project Preview</title><style>body{font:16px system-ui;max-width:42rem;margin:10vh auto;padding:2rem;background:#111;color:#eee}audio{width:100%}</style><h1>Music Project Preview</h1><p>Current digest: <code>${subjectDigest}</code></p><audio controls autoplay src=/mix.wav></audio>`);
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("PREVIEW_ADDRESS_INVALID");
  const require = createRequire(join(root, "package.json"));
  const loaded: unknown = await import(pathToFileURL(require.resolve("playwright")).href);
  const playwright = typeof loaded === "object" && loaded !== null && "default" in loaded && loaded.default ? loaded.default : loaded;
  const chromium = typeof playwright === "object" && playwright !== null && "chromium" in playwright
    ? (playwright as { chromium: { launch: (options: { headless: boolean }) => Promise<{ newPage: () => Promise<{ goto: (url: string) => Promise<unknown> }>; on: (event: "disconnected", listener: () => void) => unknown }> } }).chromium
    : undefined;
  if (!chromium) throw new Error("PLAYWRIGHT_UNAVAILABLE");
  const browser = await chromium.launch({ headless: false });
  await browser.newPage().then((page) => page.goto(`http://127.0.0.1:${(address as AddressInfo).port}`));
  process.stdout.write(`Previewing ${mixPath}; close the browser to stop.\n`);
  await new Promise<void>((resolvePromise) => browser.on("disconnected", resolvePromise));
  server.close();
}

await main().catch((error: unknown) => {
  process.stderr.write(`[music-project-preview] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

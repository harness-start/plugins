#!/usr/bin/env node

import { resolve } from "node:path";

import { createToneBrowserRenderer } from "../../lib/browser-renderer.js";
import { consumeMusicWriterCapability, processMusicWriterArgv } from "../../lib/capability.js";
import { computeMusicSubjectDigest } from "../../lib/contract.js";
import { collectMusicModel } from "../../lib/release.js";
import { renderProject } from "../../lib/renderer.js";

const root = resolve(process.argv[2] ?? process.cwd());

Promise.all([
  consumeMusicWriterCapability({ root, capability: "music-render", argv: processMusicWriterArgv() }),
  collectMusicModel(root),
]).then(([grant, model]) => {
  if (grant.subjectDigest !== computeMusicSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  process.env.AI_EXPERTS_SESSION_ID = grant.sessionId;
  return renderProject({ root, renderAudio: createToneBrowserRenderer() });
})
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[music-project-render] ${message}\n`);
    process.exitCode = 2;
  });

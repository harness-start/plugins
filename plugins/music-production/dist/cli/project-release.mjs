#!/usr/bin/env node
// harness-source-hash: sha256:11905057cbb1b275db5f6927fb0745d272f604049486b95a83bcdc19a9521265
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-QWZU5K47.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-ZACLZYKN.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-5JISRK3J.mjs";

// plugins/music-production/src/entries/cli/project-release.ts
import { resolve } from "node:path";
var root = resolve(process.argv[2] ?? process.cwd());
Promise.all([
  consumeMusicWriterCapability({ root, capability: "music-release", argv: processMusicWriterArgv() }),
  collectMusicModel(root)
]).then(([grant, model]) => {
  if (grant.subjectDigest !== computeMusicSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  process.env.AI_EXPERTS_SESSION_ID = grant.sessionId;
  return releaseProject(root);
}).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-release] ${message}
`);
  process.exitCode = 2;
});

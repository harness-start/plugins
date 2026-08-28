#!/usr/bin/env node
// harness-source-hash: sha256:a12a031a56b397d5b29f818dec46cd623eb1b9fc8eccd7c71cf6281d1a9b6cc1
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-CG7FL26B.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-TNJWHV3V.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-WFXCVJEZ.mjs";

// plugins/artifact-production/modules/music/src/entries/cli/project-release.ts
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

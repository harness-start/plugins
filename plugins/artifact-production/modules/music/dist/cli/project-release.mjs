#!/usr/bin/env node
// harness-source-hash: sha256:fc7c19bc4d8914439d6e3416e5710ae537c4947f54691186a3b2c9462eaf8ea2
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-CDUGBIPI.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-S6S44ZCC.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-MYMZ3E4E.mjs";

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

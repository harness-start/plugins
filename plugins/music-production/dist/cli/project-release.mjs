#!/usr/bin/env node
// harness-source-hash: sha256:6f8111817e27c52a37c34561b0ef1660d27e9b40e2856fa991dd96b1694fc879
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-AULF2YFE.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-AJVEZKMJ.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-EHMW6KH7.mjs";

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

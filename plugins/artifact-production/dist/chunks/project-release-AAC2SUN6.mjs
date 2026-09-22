#!/usr/bin/env node
// harness-source-hash: sha256:e391f0a627a824290ca5a1f81d0d28ec3650ef13a0f78aaa01986be4d569401c
import {
  collectMusicModel,
  releaseProject
} from "./chunk-2Q3BP7LX.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-6BVALLCR.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-DAWK3JET.mjs";
import "./chunk-6MTNLVCT.mjs";
import "./chunk-QNXKAIVA.mjs";
import "./chunk-YEA2PMNG.mjs";

// plugins/artifact-production/src/domains/music/entries/cli/project-release.ts
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

#!/usr/bin/env node
// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba
import {
  collectMusicModel,
  releaseProject
} from "./chunk-RHO2PITH.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-ZKUSVXOI.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-OYWAG7I3.mjs";
import "./chunk-AGCYVXCO.mjs";
import "./chunk-VBL6ZSQA.mjs";
import "./chunk-NNXJRIQT.mjs";

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

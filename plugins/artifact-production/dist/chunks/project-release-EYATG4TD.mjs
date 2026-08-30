#!/usr/bin/env node
// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  collectMusicModel,
  releaseProject
} from "./chunk-NKJUFUHA.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-F6N7JNNY.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-OCD6RMNM.mjs";
import "./chunk-FLUQYJTI.mjs";
import "./chunk-DSGB4CMW.mjs";
import "./chunk-QTVEXSL5.mjs";

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

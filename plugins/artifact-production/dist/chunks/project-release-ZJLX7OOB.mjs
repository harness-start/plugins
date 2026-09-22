#!/usr/bin/env node
// harness-source-hash: sha256:253573a0f3bd6ecb6a919d8e9ce5b3cd54c5fb70cc95b2a32088d75ee36cc981
import {
  collectMusicModel,
  releaseProject
} from "./chunk-5JKTV5S2.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-WR5DR2C3.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-UV3UK4BX.mjs";
import "./chunk-VHWSRWTZ.mjs";
import "./chunk-7LRQYS6E.mjs";
import "./chunk-ACZGLWAJ.mjs";

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

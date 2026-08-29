#!/usr/bin/env node
// harness-source-hash: sha256:0c811d66170e751d4c95f49bfca01deb84cbe9025b35ec552ae2ab9dd9de90a7
import {
  collectMusicModel,
  releaseProject
} from "./chunk-P2Z2BEIZ.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-YL4XED56.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-T4R3BY7A.mjs";
import "./chunk-I52IKTNP.mjs";
import "./chunk-WSR4DPVF.mjs";
import "./chunk-4DTUINPK.mjs";

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

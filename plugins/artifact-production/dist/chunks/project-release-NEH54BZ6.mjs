#!/usr/bin/env node
// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  collectMusicModel,
  releaseProject
} from "./chunk-J6KZCAST.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-6UZBXC2X.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-6QCKWDPM.mjs";
import "./chunk-CEII2P4K.mjs";
import "./chunk-IE4NLJBE.mjs";
import "./chunk-HL4EEBT7.mjs";

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

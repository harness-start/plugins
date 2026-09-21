#!/usr/bin/env node
// harness-source-hash: sha256:5a69b2936e6051b23a45a0fe4c95ae9b70fc60d9e4a2f87fcad9fc09c2802d4a
import {
  collectMusicModel,
  releaseProject
} from "./chunk-UAXH3QCE.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-NZKLNPWH.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-F3H6UQCM.mjs";
import "./chunk-2ONXY2A3.mjs";
import "./chunk-LNZRBHYO.mjs";
import "./chunk-2VFKL446.mjs";

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

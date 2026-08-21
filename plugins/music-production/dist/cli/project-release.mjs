#!/usr/bin/env node
// harness-source-hash: sha256:270295f6dc4c44f7fd0084a824f37ca0fc45d0d63c0e4317eae40b7886d899f8
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-YJA6A3I4.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-OG72MMCX.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-NMHJTGBI.mjs";

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

#!/usr/bin/env node
// harness-source-hash: sha256:9252d0cc9916d9adbb98c685ea0599f968feb60c7151c614c458b266914093e7
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-WIQQJUMV.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-LUXGHUEP.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-CA6YKXLK.mjs";

// plugins/music-project-delivery-guard/src/entries/cli/project-release.ts
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

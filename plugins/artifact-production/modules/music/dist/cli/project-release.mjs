#!/usr/bin/env node
// harness-source-hash: sha256:ab3cc7aebeec586bb7f7f6b7aaf5ca176baa1ad76e10a51ea0665bec30c4a980
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-45JLUFZ7.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-6WISBQAW.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-DBL3PMOB.mjs";

// plugins/artifact-production/modules/music/src/entries/cli/project-release.ts
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

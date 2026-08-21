#!/usr/bin/env node
// harness-source-hash: sha256:9cbbcf6c77732468ece9913fe8e40727beaeeec8a06be5ec4322c22012c7127c
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-PWFSWTWT.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-EB5YF3TV.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-3GCVCLMP.mjs";

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

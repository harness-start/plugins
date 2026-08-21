#!/usr/bin/env node
// harness-source-hash: sha256:1876110c5fe66bd958177d83d456c72c245dcdb5c89059166f5e71666880337f
import {
  collectMusicModel,
  releaseProject
} from "../chunks/chunk-77ZRBAUK.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-SOKOEVVL.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-PVD334JN.mjs";

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

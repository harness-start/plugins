#!/usr/bin/env node
// harness-source-hash: sha256:e523627cdb7cb90c4b1de7893c3cb0a39eae8bc7828023ba764a1067ac2d9844
import {
  releaseProject
} from "../chunks/chunk-YFC3FQSZ.mjs";
import "../chunks/chunk-B3UIGL2A.mjs";
import "../chunks/chunk-6UVSZ5EF.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-release.ts
import { resolve } from "node:path";
releaseProject(resolve(process.argv[2] ?? process.cwd())).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[tonejs-music-release] ${message}
`);
  process.exitCode = 2;
});

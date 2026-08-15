#!/usr/bin/env node
// harness-source-hash: sha256:f39458424842356a20167de1a7109c0fb792bb5e954cf4b9eb7faaa6aa35f2fa
import {
  releaseProject
} from "../chunks/chunk-MP7NLOF3.mjs";
import "../chunks/chunk-CK3DV5VG.mjs";
import "../chunks/chunk-XYNVSRBJ.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-release.ts
import { resolve } from "node:path";
releaseProject(resolve(process.argv[2] ?? process.cwd())).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-release] ${error.message}
`);
  process.exitCode = 2;
});

#!/usr/bin/env node
import {
  releaseProject
} from "../chunks/chunk-WHJXYLPS.mjs";
import "../chunks/chunk-XAHQWE2J.mjs";
import "../chunks/chunk-62TCAD7O.mjs";

// plugins/tonejs-music-production/src/entries/cli/project-release.ts
import { resolve } from "node:path";
releaseProject(resolve(process.argv[2] ?? process.cwd())).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  process.stderr.write(`[tonejs-music-release] ${error.message}
`);
  process.exitCode = 2;
});

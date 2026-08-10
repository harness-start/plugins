#!/usr/bin/env node

import { resolve } from "node:path";

import { releaseProject } from "../lib/release.mjs";

releaseProject(resolve(process.argv[2] ?? process.cwd()))
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error) => {
    process.stderr.write(`[tonejs-music-release] ${error.message}\n`);
    process.exitCode = 2;
  });

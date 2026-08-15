#!/usr/bin/env node

import { resolve } from "node:path";

import { releaseProject } from "../../lib/release.js";

releaseProject(resolve(process.argv[2] ?? process.cwd()))
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[tonejs-music-release] ${message}\n`);
    process.exitCode = 2;
  });

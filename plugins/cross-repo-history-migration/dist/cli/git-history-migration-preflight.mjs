#!/usr/bin/env node
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-R5OLVYDH.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

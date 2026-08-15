#!/usr/bin/env node
// harness-source-hash: sha256:65b29c425749ac6210b125683ed1556addc4b86d9f8b200c0f112d08e9202a84
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-OC2GV46V.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

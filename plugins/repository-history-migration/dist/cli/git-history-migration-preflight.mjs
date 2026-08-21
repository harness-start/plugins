#!/usr/bin/env node
// harness-source-hash: sha256:567ce8c167c6d9e39b713fd55009f8ec39fb82c8928f0fd2ea14c99df95cce4c
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-PJHIAHJK.mjs";
import "../chunks/chunk-NARDKFFM.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

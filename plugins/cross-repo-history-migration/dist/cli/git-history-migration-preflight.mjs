#!/usr/bin/env node
// harness-source-hash: sha256:a95f1fa94d234e4c7beaadecab740528ed895cb471df9069d8f5c923e47d9dda
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-2UDZPFYM.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

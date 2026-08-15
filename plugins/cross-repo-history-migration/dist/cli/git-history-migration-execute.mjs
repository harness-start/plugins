#!/usr/bin/env node
import {
  executeMigration,
  runCli
} from "../chunks/chunk-R5OLVYDH.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

#!/usr/bin/env node
// harness-source-hash: sha256:38df41e006450d986c5a8ab1e55c4d2dc2519be818dedc83f29ac6eb8554ee3b
import {
  executeMigration,
  runCli
} from "../chunks/chunk-EY7K3WZJ.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

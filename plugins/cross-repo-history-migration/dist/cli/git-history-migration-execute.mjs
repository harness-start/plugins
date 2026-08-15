#!/usr/bin/env node
// harness-source-hash: sha256:7437aaef8b98219727b258a00ebd6f4f6784a92041bbc25c9d31b7bfd9354135
import {
  executeMigration,
  runCli
} from "../chunks/chunk-IDOZ76FF.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

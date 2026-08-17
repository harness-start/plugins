#!/usr/bin/env node
// harness-source-hash: sha256:0c2a5cfcb14c2124de8ffe2ca1299b6856b86f0267d6a8acf664a854769e811f
import {
  executeMigration,
  runCli
} from "../chunks/chunk-7ORFMENP.mjs";
import "../chunks/chunk-6FDFHGCP.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

#!/usr/bin/env node
// harness-source-hash: sha256:afcad56dc8346af5bbe7c108e698f889b9b8f0175a731458c6f31e3334cc62d4
import {
  executeMigration,
  runCli
} from "../chunks/chunk-KRIM4T25.mjs";
import "../chunks/chunk-WCHII4GV.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

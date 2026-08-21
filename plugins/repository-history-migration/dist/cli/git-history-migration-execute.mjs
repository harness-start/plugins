#!/usr/bin/env node
// harness-source-hash: sha256:37ba3318871ac138633d8cdacf150ca4c42f994b05c6247bdd76d9672379450a
import {
  executeMigration,
  runCli
} from "../chunks/chunk-L3O25IXX.mjs";
import "../chunks/chunk-GFOFKWRG.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

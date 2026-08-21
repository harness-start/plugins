#!/usr/bin/env node
// harness-source-hash: sha256:7ded73f566b8392c38ac9690ecd0feb0616bd600af8955a96dfe6b92fb82d9f3
import {
  executeMigration,
  runCli
} from "../chunks/chunk-CPMEUWBQ.mjs";
import "../chunks/chunk-UIMRL2ZJ.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

#!/usr/bin/env node
// harness-source-hash: sha256:be4693ad295a0eaa9d2775c1a9f8a22751878944dfbb1f39f725f20b193d4153
import {
  executeMigration,
  runCli
} from "../chunks/chunk-5BDX34LY.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

#!/usr/bin/env node
// harness-source-hash: sha256:be4693ad295a0eaa9d2775c1a9f8a22751878944dfbb1f39f725f20b193d4153
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-5BDX34LY.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

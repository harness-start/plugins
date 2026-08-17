#!/usr/bin/env node
// harness-source-hash: sha256:65b3af3deca0fe21ee900378a4e11a07a3333f562f18a62fb58909d12aae3ea2
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-GNFLLD43.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

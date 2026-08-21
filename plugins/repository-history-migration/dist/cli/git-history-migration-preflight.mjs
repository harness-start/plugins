#!/usr/bin/env node
// harness-source-hash: sha256:ef8c1dee4727c17c58b331a0ef81f65f133265434cf7cee4cb0beb1955727e5c
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-6GMKZJWO.mjs";
import "../chunks/chunk-F4OSQJXI.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

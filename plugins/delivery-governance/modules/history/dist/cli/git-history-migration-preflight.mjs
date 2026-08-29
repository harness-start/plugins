#!/usr/bin/env node
// harness-source-hash: sha256:baec1a8208c15f43d5b979d2c165d8f6a4f7c3592db8d58b07dfe9bc67bc2286
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-SOVJZDNP.mjs";
import "../chunks/chunk-T5OHJTHW.mjs";

// plugins/delivery-governance/modules/history/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

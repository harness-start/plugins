#!/usr/bin/env node
// harness-source-hash: sha256:6062b6013ff4fec6efdc1e1e59762b2b5c3b66856149135e0bd533f6ce501aeb
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-7RRZ7OII.mjs";
import "../chunks/chunk-CCUEQDET.mjs";

// plugins/delivery-governance/modules/history/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

#!/usr/bin/env node
// harness-source-hash: sha256:b0871de4bdffb825689d5d58bdc4f12286f0b04456836f0b78d9d26354dba249
import {
  preflightMigration,
  runCli
} from "./chunk-AFAN23WD.mjs";
import "./chunk-BZEHDX6S.mjs";

// plugins/delivery-governance/src/domains/history/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

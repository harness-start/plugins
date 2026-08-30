#!/usr/bin/env node
// harness-source-hash: sha256:6b8c9a366eef51f6d24ec5fa2f416991c4cec25e08a485b1db7709aac62cff6e
import {
  preflightMigration,
  runCli
} from "./chunk-VVZMVSI5.mjs";
import "./chunk-5EK3HQ5N.mjs";

// plugins/delivery-governance/src/domains/history/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

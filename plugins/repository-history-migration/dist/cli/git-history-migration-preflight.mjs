#!/usr/bin/env node
// harness-source-hash: sha256:b18a978060669f5ef42bc3352f4fd0ae98d1fc18839397bb918c5ccd930fb3a9
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-JGQ5JBI3.mjs";
import "../chunks/chunk-HBSPX2W5.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

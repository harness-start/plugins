#!/usr/bin/env node
// harness-source-hash: sha256:42f4e1506ae8cf08535d18bda6faea06232f99470ecf9f75a82c5b7ca233ee1b
import {
  executeMigration,
  runCli
} from "./chunk-HBUC7UK7.mjs";
import "./chunk-QWRAU52J.mjs";

// plugins/delivery-governance/src/domains/history/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

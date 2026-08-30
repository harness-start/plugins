#!/usr/bin/env node
// harness-source-hash: sha256:fd0ddb33e4c5f2a33a5f072ed510d755ea29f8c2ebad8036e187d7d029ede082
import {
  executeMigration,
  runCli
} from "./chunk-ZP6XO4Y5.mjs";
import "./chunk-EYYCURQT.mjs";

// plugins/delivery-governance/src/domains/history/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

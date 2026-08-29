#!/usr/bin/env node
// harness-source-hash: sha256:c522b45b7aea50eddd02f21bc5741460ecc982a37227329f030c8303e3b3a1a6
import {
  executeMigration,
  runCli
} from "./chunk-VD73ATQC.mjs";
import "./chunk-7KAPTPQS.mjs";

// plugins/delivery-governance/src/domains/history/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

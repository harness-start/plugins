#!/usr/bin/env node
// harness-source-hash: sha256:41af16bda887e2a6ce40d58c1dfbf036a4babf821debd0557e69e2fd35a7691f
import {
  executeMigration,
  runCli
} from "../chunks/chunk-REQMHFIF.mjs";
import "../chunks/chunk-ILEJSEDV.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

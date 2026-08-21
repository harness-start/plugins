#!/usr/bin/env node
// harness-source-hash: sha256:e2bd2206604b462dd6bd4c6bd6a9bfd0eceb6ba90dc58a1275a89b577ced9b03
import {
  preflightMigration,
  runCli
} from "../chunks/chunk-PYWT2CFQ.mjs";
import "../chunks/chunk-YTZQPWMX.mjs";

// plugins/repository-history-migration/src/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

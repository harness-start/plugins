#!/usr/bin/env node
// harness-source-hash: sha256:ab392e0a98cac3fa659af4b284e027a9540d6c0d75fe7a66f07047bef6769a25
import {
  preflightMigration,
  runCli
} from "./chunk-2KETQHHU.mjs";
import "./chunk-FOW4BZ6R.mjs";

// plugins/delivery-governance/src/domains/history/entries/cli/git-history-migration-preflight.ts
runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

#!/usr/bin/env node
// harness-source-hash: sha256:1878222af03888ea87debc6809009ac6a59db1fa4ab9c74b751221fe3f44b42c
import {
  executeMigration,
  runCli
} from "../chunks/chunk-RRMJU7AL.mjs";

// plugins/cross-repo-history-migration/src/entries/cli/git-history-migration-execute.ts
runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

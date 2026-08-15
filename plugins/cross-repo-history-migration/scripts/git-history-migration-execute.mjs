#!/usr/bin/env node
import { executeMigration } from "./lib/history-migration.mjs";
import { runCli } from "./lib/cli.mjs";

runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

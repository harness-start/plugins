#!/usr/bin/env node
import { preflightMigration } from "./lib/history-migration.mjs";
import { runCli } from "./lib/cli.mjs";

runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

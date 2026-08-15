#!/usr/bin/env node
import { preflightMigration } from "../../lib/history-migration.js";
import { runCli } from "../../lib/cli.js";

runCli("git-history-migration-preflight", preflightMigration, process.argv.slice(2));

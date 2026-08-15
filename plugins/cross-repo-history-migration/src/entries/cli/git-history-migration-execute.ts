#!/usr/bin/env node
import { executeMigration } from "../../lib/history-migration.js";
import { runCli } from "../../lib/cli.js";

runCli("git-history-migration-execute", executeMigration, process.argv.slice(2));

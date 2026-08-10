#!/usr/bin/env node
import { runCli } from "./lib/report-cli.mjs";
process.exitCode = await runCli("weekly", "prepare");

#!/usr/bin/env node
import { runCli } from "./lib/report-cli.mjs";
process.exitCode = await runCli("report", "addition-prepare");

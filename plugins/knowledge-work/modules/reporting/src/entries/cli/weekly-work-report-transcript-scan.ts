#!/usr/bin/env node
import { runCli } from "../../lib/report-cli.js";
process.exitCode = await runCli("weekly", "scan");

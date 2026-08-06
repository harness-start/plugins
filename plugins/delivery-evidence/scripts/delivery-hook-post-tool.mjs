#!/usr/bin/env node
import { report, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { postReports } from "./checks/post-files.mjs";
import { trackTdd } from "./checks/tdd.mjs";
const event = await readStdinJson(); if (!event.__parseError) { const reports = postReports(event); const tdd = trackTdd(event); if (tdd) reports.push(tdd); if (reports.length) writeJson(report("PostToolUse", reports.join("\n\n"))); }

#!/usr/bin/env node
import { additionalContextOutput, extractCwd, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { ledgerResumeContext } from "./checks/ledger.mjs";
const event = await readStdinJson(); const context = !event.__parseError ? ledgerResumeContext(extractCwd(event)) : null; if (context) writeJson(additionalContextOutput("SessionStart", context));

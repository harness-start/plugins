#!/usr/bin/env node
import { additionalContextOutput, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { environmentContext, lintCoverageContext } from "./checks/runtime-context.mjs";
const event = await readStdinJson(); const lifecycle = process.argv[2] ?? "UserPromptSubmit";
const context = event.__parseError ? null : lifecycle === "SessionStart" ? lintCoverageContext(event) : environmentContext(event);
if (context) writeJson(additionalContextOutput(lifecycle, context));

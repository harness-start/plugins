#!/usr/bin/env node
import { additionalContextOutput, extractCwd, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { miscEnvironment } from "./checks/environment.mjs";
const event = await readStdinJson(); const report = !event.__parseError ? miscEnvironment(extractCwd(event)) : null; if (report) writeJson(additionalContextOutput("UserPromptSubmit", report));

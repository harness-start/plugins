#!/usr/bin/env node
import { additionalContextOutput, extractCwd, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { frontendEnvironment } from "./checks/environment.mjs";
const event = await readStdinJson();
const report = !event.__parseError ? frontendEnvironment(extractCwd(event)) : null;
if (report) writeJson(additionalContextOutput("UserPromptSubmit", report));

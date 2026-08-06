#!/usr/bin/env node
import { additionalContextOutput, extractCwd, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { mobileEnvironment } from "./checks/environment.mjs";

const event = await readStdinJson();
const report = !event.__parseError ? mobileEnvironment(extractCwd(event)) : null;
if (report) writeJson(additionalContextOutput("UserPromptSubmit", report));

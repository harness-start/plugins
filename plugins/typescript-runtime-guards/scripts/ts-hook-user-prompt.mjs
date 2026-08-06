#!/usr/bin/env node
import { additionalContextOutput, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { environmentContext } from "./checks/runtime-context.mjs";
const event = await readStdinJson();
const context = event.__parseError ? null : environmentContext(event);
if (context) writeJson(additionalContextOutput("UserPromptSubmit", context));

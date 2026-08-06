#!/usr/bin/env node
import { additionalContextOutput, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { phpstanStop } from "./checks/stateful-runtime.mjs";
const event = await readStdinJson(); const result = event.__parseError ? null : await phpstanStop(event);
if (result?.action === "deny") writeJson({ decision: "block", reason: result.message });
else if (result?.message) writeJson(additionalContextOutput("Stop", result.message));

import { isRecord, type HookEvent } from "@harness/core/hook-event";

import { handleSoftwareDebugging } from "../../src/domains/debugging/hook.js";

const mode = process.argv[2];
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let event: HookEvent;
try {
  const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
  event = isRecord(parsed) ? parsed : {};
} catch {
  event = { __parseError: true };
}
const outputs = await handleSoftwareDebugging({
  args: mode ? [mode] : [],
  event,
  eventName: "Test",
  host: "codex",
  raw,
  trigger: "test:debugging",
});
for (const output of outputs) process.stdout.write(`${JSON.stringify(output)}\n`);

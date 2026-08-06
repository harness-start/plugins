#!/usr/bin/env node
import { contextRuleContext, promptContext, sessionContext, stopContext } from "./runtime.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let event = {};
try { event = raw.trim() ? JSON.parse(raw) : {}; } catch { process.exit(0); }

const lifecycle = process.argv[2] ?? "";
const handlers = { SessionStart: sessionContext, UserPromptSubmit: promptContext, PreToolUse: contextRuleContext, Stop: stopContext };
const text = handlers[lifecycle] ? await handlers[lifecycle](event) : null;
if (text) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: lifecycle, additionalContext: text } })}\n`);

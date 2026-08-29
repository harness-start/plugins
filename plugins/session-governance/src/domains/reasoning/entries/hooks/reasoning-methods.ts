#!/usr/bin/env node

import { readStdinJson } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";

import { reasoningMethodsContext } from "../../session-context.ts";

function warn(message: string): void {
  process.stderr.write(`[reasoning-methods] ${message}\n`);
}

export async function runSessionStart(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", reasoningMethodsContext()));
}

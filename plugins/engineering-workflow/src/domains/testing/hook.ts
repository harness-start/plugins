#!/usr/bin/env node

import type { HookOutput, OwnerHookHandlerContext } from "@harness/core/aio-dispatcher";
import { additionalContext } from "@harness/core/hook-output";

function warn(message: string): void {
  process.stderr.write(`[test-driven-development] ${message}\n`);
}

function sessionStartOutput(): HookOutput[] {
  const output = additionalContext("SessionStart", [
    "[TDD Method] Test-driven development is advisory.",
    "This Hook does not enforce file order or infer relationships between tests and implementation.",
    "For behavior changes, prefer a focused RED -> GREEN loop and run the same focused test after the last implementation change.",
    "Optional method: load `tdd-red-green`. Skill load is not a Hook prerequisite.",
  ].join("\n"));
  return output ? [output as HookOutput] : [];
}

export async function handleTesting(
  { args, event }: OwnerHookHandlerContext,
): Promise<HookOutput[]> {
  if (args[0] !== "session-start") return [];
  if (event.__parseError) {
    warn("hook input was not valid JSON; advisory context was skipped");
    return [];
  }
  try {
    return sessionStartOutput();
  } catch (error: unknown) {
    warn(`advisory context failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

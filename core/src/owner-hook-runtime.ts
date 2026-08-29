import { AsyncLocalStorage } from "node:async_hooks";

import type { HookEvent } from "./hook-event.js";
import type { HookOutput, OwnerHookHandler } from "./aio-dispatcher.js";

type OwnerHookInvocation = {
  args: string[];
  event: HookEvent;
  outputs: unknown[];
};

const invocationStorage = new AsyncLocalStorage<OwnerHookInvocation>();

export class OwnerHookExitError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`owner hook exited with status ${status}`);
    this.name = "OwnerHookExitError";
    this.status = status;
  }
}

export function currentOwnerHookEvent(): HookEvent | undefined {
  return invocationStorage.getStore()?.event;
}

export function collectOwnerHookOutput(value: unknown): boolean {
  const invocation = invocationStorage.getStore();
  if (!invocation) return false;
  if (value !== null && value !== undefined) invocation.outputs.push(value);
  return true;
}

export async function invokeOwnerHook(
  event: HookEvent,
  args: string[],
  operation: () => void | Promise<void>,
): Promise<unknown[]> {
  const outputs: unknown[] = [];
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-hook", ...args];
  process.exitCode = undefined;
  try {
    await invocationStorage.run({ args, event, outputs }, operation);
    if (typeof process.exitCode === "number" && process.exitCode !== 0) {
      throw new OwnerHookExitError(process.exitCode);
    }
    return outputs;
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
}

export function ownerHookHandler(operation: () => void | Promise<void>): OwnerHookHandler {
  return async ({ args, event }) => {
    try {
      return await invokeOwnerHook(event, args, operation) as HookOutput[];
    } catch (error) {
      if (error instanceof OwnerHookExitError) {
        process.exitCode = error.status;
        return [];
      }
      throw error;
    }
  };
}

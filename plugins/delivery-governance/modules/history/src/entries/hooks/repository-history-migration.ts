#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readStdinJson } from "@harness/core/hook-event";
import { extractShellCommand } from "@harness/core/hook-targets";
import { preToolDeny, writeJson } from "@harness/core/hook-output";

import { classifySourceProtectCommand, formatSourceProtectDeny } from "../../source-protect.ts";

function warn(message: string): void {
  process.stderr.write(`[repository-history-migration] ${message}\n`);
}

export async function runPreToolUse(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; source-protect skipped");
  const command = extractShellCommand(event);
  if (!command) return;
  const finding = classifySourceProtectCommand(command);
  if (finding) writeJson(preToolDeny(formatSourceProtectDeny(finding)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreToolUse().catch((error: unknown) => {
    warn(error instanceof Error ? error.message : String(error));
    process.exit(0);
  });
}

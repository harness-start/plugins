#!/usr/bin/env node

import {
  extractCwd, extractPrompt, extractSessionId, readStdinJson,
} from "../../lib/hook-io.js";
import { recordWorktreeCreateAllowance, userRequestedWorktreeCreate } from "../../lib/worktree-intent.js";

function warn(message: string): void {
  process.stderr.write(`[git-delivery] ${message}\n`);
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (!userRequestedWorktreeCreate(extractPrompt(event))) return;
  recordWorktreeCreateAllowance(extractCwd(event), extractSessionId(event), "user-prompt");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  warn(`user prompt hook failed open: ${message}`);
});

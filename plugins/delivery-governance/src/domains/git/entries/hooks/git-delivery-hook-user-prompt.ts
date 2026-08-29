#!/usr/bin/env node

import {
  extractCwd, extractPrompt, extractSessionId, readStdinJson,
} from "../../lib/hook-io.js";
import { resolveRepoRoot } from "../../checks/file-checks.js";
import { recordWorktreeCreateAllowance, userRequestedWorktreeCreate } from "../../lib/worktree-intent.js";

export async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (!userRequestedWorktreeCreate(extractPrompt(event))) return;
  const cwd = extractCwd(event);
  recordWorktreeCreateAllowance(resolveRepoRoot(cwd) ?? cwd, extractSessionId(event), "user-prompt");
}

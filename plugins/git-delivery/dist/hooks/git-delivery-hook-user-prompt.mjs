#!/usr/bin/env node
// harness-source-hash: sha256:03d18d20a325dc52bf5f629a3b077cb21fa4769573273d503348dd8dc3ae9cb5
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-B7HIICQE.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson,
  resolveRepoRoot
} from "../chunks/chunk-DYCLW5DJ.mjs";

// plugins/git-delivery/src/entries/hooks/git-delivery-hook-user-prompt.ts
function warn(message) {
  process.stderr.write(`[git-delivery] ${message}
`);
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (!userRequestedWorktreeCreate(eventPrompt(event))) return;
  const cwd = eventCwd(event);
  recordWorktreeCreateAllowance(resolveRepoRoot(cwd) ?? cwd, eventSessionId(event), "user-prompt");
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  warn(`user prompt hook failed open: ${message}`);
});

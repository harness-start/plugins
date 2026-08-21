#!/usr/bin/env node
// harness-source-hash: sha256:57569677924cad9d579da55eb111411406046b1ba11093aff42a9c87d04c8c47
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-TKSHDHYS.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson,
  resolveRepoRoot
} from "../chunks/chunk-ZVFRZNHB.mjs";

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

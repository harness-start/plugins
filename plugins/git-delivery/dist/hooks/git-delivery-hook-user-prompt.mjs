#!/usr/bin/env node
// harness-source-hash: sha256:33cc52d23aae608a5d6c8a2efea2ebe78fc416df4d175db64653a38e8950e523
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-DQBP5LWI.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson,
  resolveRepoRoot
} from "../chunks/chunk-OLUWPGKU.mjs";

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

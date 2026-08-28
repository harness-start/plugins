#!/usr/bin/env node
// harness-source-hash: sha256:30a9e28f6f7149e592f0764780fa7a4027cffce9ad8587e9314746201e496d46
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-OID4DYUM.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson,
  resolveRepoRoot
} from "../chunks/chunk-2YNETJXG.mjs";

// plugins/delivery-governance/modules/git/src/entries/hooks/git-delivery-hook-user-prompt.ts
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

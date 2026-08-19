#!/usr/bin/env node
// harness-source-hash: sha256:1d952498890ad388eddbbc17d0f899c24e442a2725c5cd1cba0652ccc1fca3a6
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-Q6SOTMN7.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson
} from "../chunks/chunk-I2VJ6UPN.mjs";

// plugins/git-delivery/src/entries/hooks/git-delivery-hook-user-prompt.ts
function warn(message) {
  process.stderr.write(`[git-delivery] ${message}
`);
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (!userRequestedWorktreeCreate(eventPrompt(event))) return;
  recordWorktreeCreateAllowance(eventCwd(event), eventSessionId(event), "user-prompt");
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  warn(`user prompt hook failed open: ${message}`);
});

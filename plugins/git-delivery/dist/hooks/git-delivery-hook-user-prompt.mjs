#!/usr/bin/env node
// harness-source-hash: sha256:7aa3eb7d3aa82beb1eeccf55ee92f5fa0596a7425e7ffeb909dbe68047510f02
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-U3RYV4HS.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson,
  resolveRepoRoot
} from "../chunks/chunk-NDWCKHHF.mjs";

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

#!/usr/bin/env node
// harness-source-hash: sha256:b5503af635117964ca63ec9658d0cf107d5dd4109556add2d6b1ba2c4342bf14
import {
  recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate
} from "../chunks/chunk-AST5GRBT.mjs";
import {
  eventCwd,
  eventPrompt,
  eventSessionId,
  readStdinJson
} from "../chunks/chunk-G6TGSGCB.mjs";

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

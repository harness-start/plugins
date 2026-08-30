import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { runHook as runCiDelivery } from "../../domains/ci/entries/hooks/ci-gated-delivery.js";
import { main as runGitPost } from "../../domains/git/entries/hooks/git-delivery-hook-post-tool.js";
import { main as runGitPre } from "../../domains/git/entries/hooks/git-delivery-hook-pre-tool.js";
import { main as runGitPrompt } from "../../domains/git/entries/hooks/git-delivery-hook-user-prompt.js";
import { main as runGitStop } from "../../domains/git/entries/hooks/git-delivery-hook-stop.js";
import { runPreToolUse as runHistoryMigration } from "../../domains/history/entries/hooks/repository-history-migration.js";

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "ci:ci-gated-delivery": ownerHookHandler(runCiDelivery),
  "git:git-delivery-hook-post-tool": ownerHookHandler(runGitPost),
  "git:git-delivery-hook-pre-tool": ownerHookHandler(runGitPre),
  "git:git-delivery-hook-user-prompt": ownerHookHandler(runGitPrompt),
  "git:git-delivery-hook-stop": ownerHookHandler(runGitStop),
  "history:repository-history-migration": ownerHookHandler(runHistoryMigration),
});

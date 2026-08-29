import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { main as runReporting } from "../../domains/reporting/entries/hooks/work-reporting-hook.js";
import { main as runResearch } from "../../domains/research/entries/hooks/evidence-based-research.js";
import { runPostToolUse, runSessionStart, runUserPromptSubmit } from "../../domains/writing/entries/hooks/professional-writing.js";

async function runWriting(): Promise<void> {
  const mode = process.argv[2] ?? "session";
  if (mode === "post") await runPostToolUse();
  else if (mode === "prompt" || mode === "user-prompt") await runUserPromptSubmit();
  else await runSessionStart();
}

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "reporting:work-reporting-hook": ownerHookHandler(runReporting),
  "research:evidence-based-research": ownerHookHandler(runResearch),
  "writing:professional-writing": ownerHookHandler(runWriting),
});

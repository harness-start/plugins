import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { main as runDiscipline } from "../../domains/discipline/entries/hooks/execution-discipline.js";
import { main as runIntent } from "../../domains/intent/entries/hooks/intent-discovery.js";
import { main as runLanguagePost } from "../../domains/language/entries/hooks/language-output-hook-post-tool.js";
import { main as runLanguageSession } from "../../domains/language/entries/hooks/language-output-hook-session-start.js";
import { main as runLanguageStop } from "../../domains/language/entries/hooks/language-output-hook-stop.js";
import { main as runLanguagePrompt } from "../../domains/language/entries/hooks/language-output-hook-user-prompt.js";
import { runSessionStart as runPracticeSession, runUserPromptSubmit as runPracticePrompt } from "../../domains/practice/entries/hooks/engineering-practice.js";
import { runSessionStart as runReasoning } from "../../domains/reasoning/entries/hooks/reasoning-methods.js";

async function runPractice(): Promise<void> {
  if (process.argv[2] === "user-prompt") await runPracticePrompt();
  else await runPracticeSession();
}

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "discipline:execution-discipline": ownerHookHandler(runDiscipline),
  "intent:intent-discovery": ownerHookHandler(runIntent),
  "language:language-output-hook-post-tool": ownerHookHandler(runLanguagePost),
  "language:language-output-hook-session-start": ownerHookHandler(runLanguageSession),
  "language:language-output-hook-stop": ownerHookHandler(runLanguageStop),
  "language:language-output-hook-user-prompt": ownerHookHandler(runLanguagePrompt),
  "practice:engineering-practice": ownerHookHandler(runPractice),
  "reasoning:reasoning-methods": ownerHookHandler(runReasoning),
});

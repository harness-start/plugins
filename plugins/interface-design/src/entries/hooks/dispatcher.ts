import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { runPost, runSession, runStop } from "../../domains/craft/entries/hooks/interface-craft.js";

async function runCraft(): Promise<void> {
  const mode = process.argv[2] ?? "session";
  if (mode === "post") await runPost();
  else if (mode === "stop") await runStop();
  else runSession();
}

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "craft:interface-craft": ownerHookHandler(runCraft),
});

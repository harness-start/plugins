import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";
import { ownerHookHandler } from "../../../../../core/src/owner-hook-runtime.js";

import { main as runActivityAudit } from "../../domains/activity/entries/hooks/agent-activity-audit.js";

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "activity:agent-activity-audit": ownerHookHandler(runActivityAudit),
});

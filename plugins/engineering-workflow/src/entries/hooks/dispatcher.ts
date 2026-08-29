import { runOwnerDispatcher } from "../../../../../core/src/aio-dispatcher.js";

import { handleSoftwareDebugging } from "../../domains/debugging/hook.js";
import { handleSpecification } from "../../domains/specification/hook.js";
import { handleTesting } from "../../domains/testing/hook.js";

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  debugging: handleSoftwareDebugging,
  specification: handleSpecification,
  testing: handleTesting,
});

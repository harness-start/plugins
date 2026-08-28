import { runAioDispatcher } from "../../../../../core/src/aio-dispatcher.js";

const [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
runAioDispatcher(host, eventName);

import { runOwnerCli } from "../../../../../core/src/aio-cli.js";

import { main as runDebugCommand } from "../../domains/debugging/command.js";
import { main as runSpecificationCommand } from "../../domains/specification/command.js";

await runOwnerCli(process.argv.slice(2), {
  debugging: runDebugCommand,
  specification: runSpecificationCommand,
});

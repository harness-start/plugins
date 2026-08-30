import { ownerCliModuleHandler, runOwnerCli } from "../../../../../core/src/aio-cli.js";

await runOwnerCli(process.argv.slice(2), {
  "commands:runtime-log-sanitize": ownerCliModuleHandler(async () => {
    await import("../../domains/commands/entries/cli/runtime-log-sanitize.js");
  }),
});

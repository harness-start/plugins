import { ownerCliModuleHandler, runOwnerCli } from "../../../../../core/src/aio-cli.js";

const handlers = {
  "history:git-history-migration-execute": ownerCliModuleHandler(async () => { await import("../../domains/history/entries/cli/git-history-migration-execute.js"); }),
  "history:git-history-migration-preflight": ownerCliModuleHandler(async () => { await import("../../domains/history/entries/cli/git-history-migration-preflight.js"); }),
};

await runOwnerCli(process.argv.slice(2), handlers);

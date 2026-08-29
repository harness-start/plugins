// harness-source-hash: sha256:94704f8db952a375e0a6e7819d3587dac9c74d76e988a0b79fc5afa01f5a2ff6

// core/src/aio-cli.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
var ownerCliInvocation = new AsyncLocalStorage();
function ownerCliModuleHandler(loader) {
  return async (args) => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-cli", ...args];
    process.exitCode = void 0;
    try {
      await loader();
      return typeof process.exitCode === "number" ? process.exitCode : 0;
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  };
}
function pluginRoot() {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}
async function dispatchCliRoute(input) {
  const [resource, action, ...rest] = input.argv;
  if (!resource || !action) return 2;
  const route = input.routes[resource]?.[action] ?? input.routes[resource]?.["*"];
  if (!route) return 2;
  const handler = input.handlers[route.handler];
  if (!handler) throw new Error(`${route.handler}: owner CLI handler is not registered`);
  const args = [...route.args ?? [], ...route.forwardAction ? [action, ...rest] : rest];
  const publicArgv = [resolve(process.argv[1] ?? ""), ...input.argv];
  const result = await ownerCliInvocation.run(publicArgv, () => handler(args));
  return typeof result === "number" ? result : typeof process.exitCode === "number" ? process.exitCode : 0;
}
async function runOwnerCli(argv, handlers2) {
  const [resource, action] = argv;
  if (!resource || !action) {
    process.stderr.write("Usage: harness <resource> <action> [arguments]\n");
    process.exitCode = 2;
    return;
  }
  const root = pluginRoot();
  let routes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", "cli.json"), "utf8"));
  } catch (error) {
    process.stderr.write(`[harness] unable to load CLI routes: ${String(error)}
`);
    process.exitCode = 1;
    return;
  }
  if (!routes[resource]?.[action] && !routes[resource]?.["*"]) {
    process.stderr.write(`[harness] unsupported command: ${resource} ${action}
`);
    process.exitCode = 2;
    return;
  }
  process.exitCode = await dispatchCliRoute({ argv, handlers: handlers2, routes });
}

// plugins/knowledge-work/src/entries/cli/harness.ts
var handlers = {
  "reporting:daily-work-report-collect": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-collect-PYKKLZYW.mjs");
  }),
  "reporting:daily-work-report-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-prepare-MIA7A3VI.mjs");
  }),
  "reporting:daily-work-report-save": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-save-ETCT6TGE.mjs");
  }),
  "reporting:daily-work-report-transcript-scan": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-transcript-scan-K6F6FL3H.mjs");
  }),
  "reporting:weekly-work-report-collect": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-collect-TJSK2BAD.mjs");
  }),
  "reporting:weekly-work-report-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-prepare-BOE2KW7B.mjs");
  }),
  "reporting:weekly-work-report-save": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-save-NWFJ65EZ.mjs");
  }),
  "reporting:weekly-work-report-transcript-scan": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-transcript-scan-XDDCHWDK.mjs");
  }),
  "reporting:work-reporting-addition-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/work-reporting-addition-prepare-44AKHUP3.mjs");
  }),
  "reporting:work-reporting-append": ownerCliModuleHandler(async () => {
    await import("../chunks/work-reporting-append-YL4CPHTV.mjs");
  }),
  "reporting:work-reporting-verify": ownerCliModuleHandler(async () => {
    await import("../chunks/work-reporting-verify-GY2HJMVJ.mjs");
  }),
  "reporting:work-summary-report-collect": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-collect-GOJVP5A3.mjs");
  }),
  "reporting:work-summary-report-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-prepare-BN54U3KC.mjs");
  }),
  "reporting:work-summary-report-save": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-save-7FEPIXPJ.mjs");
  }),
  "reporting:work-summary-report-transcript-scan": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-transcript-scan-L53KXQCH.mjs");
  }),
  "research:research-workflow": ownerCliModuleHandler(async () => {
    const { main } = await import("../chunks/research-workflow-NXFJPXGB.mjs");
    await main();
  }),
  "writing:analyze-ai-style": ownerCliModuleHandler(async () => {
    await import("../chunks/analyze-ai-style-WYTXNW5I.mjs");
  })
};
await runOwnerCli(process.argv.slice(2), handlers);

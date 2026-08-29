// harness-source-hash: sha256:79eb582ff70d8199af6be7045d1a61bcfac5a7992385c0dc88fd75a3d05b1601

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
    await import("../chunks/daily-work-report-collect-ABIG7UJH.mjs");
  }),
  "reporting:daily-work-report-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-prepare-MSFATEQ4.mjs");
  }),
  "reporting:daily-work-report-save": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-save-3NMNICZI.mjs");
  }),
  "reporting:daily-work-report-transcript-scan": ownerCliModuleHandler(async () => {
    await import("../chunks/daily-work-report-transcript-scan-CKV5EKZP.mjs");
  }),
  "reporting:weekly-work-report-collect": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-collect-3IUHM4XZ.mjs");
  }),
  "reporting:weekly-work-report-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-prepare-XBJPN5RO.mjs");
  }),
  "reporting:weekly-work-report-save": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-save-HACNKIAU.mjs");
  }),
  "reporting:weekly-work-report-transcript-scan": ownerCliModuleHandler(async () => {
    await import("../chunks/weekly-work-report-transcript-scan-6OVVJ5AX.mjs");
  }),
  "reporting:work-reporting-addition-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/work-reporting-addition-prepare-U6XWCK2X.mjs");
  }),
  "reporting:work-reporting-append": ownerCliModuleHandler(async () => {
    await import("../chunks/work-reporting-append-RUQOT3TJ.mjs");
  }),
  "reporting:work-reporting-verify": ownerCliModuleHandler(async () => {
    await import("../chunks/work-reporting-verify-OODVEQNM.mjs");
  }),
  "reporting:work-summary-report-collect": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-collect-ZWR4GX4K.mjs");
  }),
  "reporting:work-summary-report-prepare": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-prepare-FGFWP4FD.mjs");
  }),
  "reporting:work-summary-report-save": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-save-NMU6UPDI.mjs");
  }),
  "reporting:work-summary-report-transcript-scan": ownerCliModuleHandler(async () => {
    await import("../chunks/work-summary-report-transcript-scan-ORB7WD2T.mjs");
  }),
  "research:research-workflow": ownerCliModuleHandler(async () => {
    const { main } = await import("../chunks/research-workflow-37WTE53X.mjs");
    await main();
  }),
  "writing:analyze-ai-style": ownerCliModuleHandler(async () => {
    await import("../chunks/analyze-ai-style-43ZXBECZ.mjs");
  })
};
await runOwnerCli(process.argv.slice(2), handlers);

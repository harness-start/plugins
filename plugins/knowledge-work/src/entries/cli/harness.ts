import { ownerCliModuleHandler, runOwnerCli } from "../../../../../core/src/aio-cli.js";

const handlers = {
  "reporting:daily-work-report-collect": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/daily-work-report-collect.js"); }),
  "reporting:daily-work-report-prepare": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/daily-work-report-prepare.js"); }),
  "reporting:daily-work-report-save": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/daily-work-report-save.js"); }),
  "reporting:daily-work-report-transcript-scan": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/daily-work-report-transcript-scan.js"); }),
  "reporting:weekly-work-report-collect": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/weekly-work-report-collect.js"); }),
  "reporting:weekly-work-report-prepare": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/weekly-work-report-prepare.js"); }),
  "reporting:weekly-work-report-save": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/weekly-work-report-save.js"); }),
  "reporting:weekly-work-report-transcript-scan": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/weekly-work-report-transcript-scan.js"); }),
  "reporting:work-reporting-addition-prepare": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-reporting-addition-prepare.js"); }),
  "reporting:work-reporting-append": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-reporting-append.js"); }),
  "reporting:work-reporting-verify": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-reporting-verify.js"); }),
  "reporting:work-summary-report-collect": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-summary-report-collect.js"); }),
  "reporting:work-summary-report-prepare": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-summary-report-prepare.js"); }),
  "reporting:work-summary-report-save": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-summary-report-save.js"); }),
  "reporting:work-summary-report-transcript-scan": ownerCliModuleHandler(async () => { await import("../../domains/reporting/entries/cli/work-summary-report-transcript-scan.js"); }),
  "research:research-workflow": ownerCliModuleHandler(async () => { const { main } = await import("../../domains/research/entries/cli/research-workflow.js"); await main(); }),
  "writing:analyze-ai-style": ownerCliModuleHandler(async () => { await import("../../domains/writing/entries/cli/analyze-ai-style.js"); }),
};

await runOwnerCli(process.argv.slice(2), handlers);

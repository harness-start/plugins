#!/usr/bin/env node

import {
  additionalContextOutput,
  extractCwd,
  extractShellCommand,
  extractToolInput,
  extractToolName,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import { isShellTool, normalizeToolName } from "./lib/matchers.mjs";
import { advancedCommandFindings, advancedMessage } from "./checks/advanced-command.mjs";
import { secretReadReport } from "./checks/secret-read.mjs";
import { escalationMessage, recordDeny } from "./lib/deny-state.mjs";
import {
  dangerousCommandDenyMessage,
  dangerousCommandHits,
} from "./checks/dangerous-command.mjs";
import {
  sedInplaceDenyMessage,
  sedInplaceHit,
} from "./checks/sed-inplace.mjs";
import {
  catWriteClassification,
  catWriteDenyMessage,
  catWriteReportMessage,
} from "./checks/cat-write.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = normalizeToolName(extractToolName(event));
  const toolInput = extractToolInput(event);
  if (/^Read$/iu.test(toolName)) {
    const report = secretReadReport([toolInput?.file_path, toolInput?.filePath, toolInput?.path, ...(event?.tool?.fileTargets ?? [])].filter(Boolean));
    if (report) writeJson(additionalContextOutput("PreToolUse", report));
    process.exit(0);
  }
  if (!isShellTool(toolName)) process.exit(0);

  const command = extractShellCommand(toolName, toolInput) ?? "";
  if (!command) process.exit(0);

  const escalation = escalationMessage(event, command);
  if (escalation) {
    writeJson(preToolDeny(escalation));
    process.exit(0);
  }

  const dangerousHits = dangerousCommandHits(command, extractCwd(event));
  if (dangerousHits.length > 0) {
    recordDeny(event, command, "dangerous-command-guard");
    writeJson(
      preToolDeny(dangerousCommandDenyMessage(dangerousHits, command)),
    );
    process.exit(0);
  }

  if (sedInplaceHit(command)) {
    recordDeny(event, command, "sed-inplace-guard");
    writeJson(preToolDeny(sedInplaceDenyMessage(command)));
    process.exit(0);
  }

  const catClassification = catWriteClassification(command);
  if (catClassification.action === "deny") {
    recordDeny(event, command, "cat-write-guard");
    writeJson(preToolDeny(catWriteDenyMessage(command)));
    process.exit(0);
  }
  const advanced = advancedCommandFindings(command, event);
  const denied = advanced.find((finding) => finding.action === "deny");
  if (denied) {
    recordDeny(event, command, denied.id);
    writeJson(preToolDeny(advancedMessage(denied)));
    process.exit(0);
  }
  const reports = advanced.filter((finding) => finding.action === "report").map(advancedMessage);
  if (catClassification.action === "report") reports.unshift(catWriteReportMessage(command));
  if (reports.length > 0) writeJson(additionalContextOutput("PreToolUse", reports.join("\n\n")));
}

main().catch(() => process.exit(0));

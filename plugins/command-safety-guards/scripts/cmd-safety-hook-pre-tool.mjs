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
  if (!isShellTool(toolName)) process.exit(0);

  const toolInput = extractToolInput(event);
  const command = extractShellCommand(toolName, toolInput) ?? "";
  if (!command) process.exit(0);

  const dangerousHits = dangerousCommandHits(command, extractCwd(event));
  if (dangerousHits.length > 0) {
    writeJson(
      preToolDeny(dangerousCommandDenyMessage(dangerousHits, command)),
    );
    process.exit(0);
  }

  if (sedInplaceHit(command)) {
    writeJson(preToolDeny(sedInplaceDenyMessage(command)));
    process.exit(0);
  }

  const catClassification = catWriteClassification(command);
  if (catClassification.action === "deny") {
    writeJson(preToolDeny(catWriteDenyMessage(command)));
    process.exit(0);
  }
  if (catClassification.action === "report") {
    writeJson(
      additionalContextOutput("PreToolUse", catWriteReportMessage(command)),
    );
  }
}

main().catch(() => process.exit(0));

#!/usr/bin/env node

import {
  additionalContextOutput, extractCwd, extractShellCommand, extractToolInput,
  extractToolName, preToolDeny, readStdinJson, writeJson,
} from "../../lib/hook-io.js";
import { classifyDeliveryCommand, formatDeliveryFinding } from "../../checks/command-rules.js";
import { deliveryStateFindings } from "../../checks/state-checks.js";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const command = extractShellCommand(extractToolName(event), extractToolInput(event));
  if (!command) return;
  const cwd = extractCwd(event);
  const findings = [
    ...classifyDeliveryCommand(command, cwd),
    ...deliveryStateFindings(cwd, command),
  ];
  const denied = findings.find((finding) => finding.action === "deny");
  if (denied) writeJson(preToolDeny(formatDeliveryFinding(denied)));
  else if (findings.length) {
    writeJson(additionalContextOutput(
      "PreToolUse",
      findings.map(formatDeliveryFinding).join("\n\n"),
    ));
  }
}

main().catch((error) => {
  process.stderr.write(`[git-delivery-guards] pre hook failed open: ${error?.message ?? error}\n`);
  process.exit(0);
});

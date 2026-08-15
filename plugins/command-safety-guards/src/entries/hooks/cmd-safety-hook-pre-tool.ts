#!/usr/bin/env node

/**
 * command-safety-guards — PreToolUse entry
 *
 * Flow:
 *   Read → secretRead engine
 *   shell → escalation → dangerousRm → declarative rules → mysql preflight
 */

import { isRecord } from "@harness/core/hook-event";
import {
  additionalContextOutput,
  extractCwd,
  extractShellCommand,
  extractToolInput,
  extractToolName,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "../../lib/hook-io.js";
import { isShellTool, normalizeToolName } from "../../lib/matchers.js";
import {
  formatFinding,
  loadUserConfig,
  matchRule,
  resolveRepoRoot,
  resolveRules,
} from "../../lib/rule-engine.js";
import {
  mysqlPreflightDenyMessage,
  mysqlReplicationPreflightFinding,
} from "../../engines/mysql-preflight.js";
import { secretReadReport } from "../../engines/secret-read.js";
import { escalationMessage, recordDeny } from "../../lib/deny-state.js";
import {
  dangerousCommandDenyMessage,
  dangerousCommandHits,
} from "../../engines/dangerous-rm.js";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = normalizeToolName(extractToolName(event));
  const toolInput = extractToolInput(event);
  const cwd = extractCwd(event);

  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const { rules, settings } = resolveRules(userConfig);

  if (/^Read$/iu.test(toolName)) {
    if (settings.engines.secretRead !== false) {
      const tool = isRecord(event.tool) ? event.tool : null;
      const extraTargets = Array.isArray(tool?.fileTargets) ? tool.fileTargets : [];
      const report = secretReadReport(
        [
          toolInput.file_path,
          toolInput.filePath,
          toolInput.path,
          ...extraTargets,
        ].filter(Boolean),
      );
      if (report) writeJson(additionalContextOutput("PreToolUse", report));
    }
    process.exit(0);
  }

  if (!isShellTool(toolName)) process.exit(0);

  const command = extractShellCommand(toolName, toolInput) ?? "";
  if (!command) process.exit(0);

  if (settings.engines.denyEscalation !== false) {
    const escalation = escalationMessage(event, command, settings.escalation);
    if (escalation) {
      writeJson(preToolDeny(escalation));
      process.exit(0);
    }
  }

  // dangerousRm runs before declarative rules so compound commands like
  // `rm -rf /; sed -i ...` fail closed on the filesystem delete first.
  if (settings.engines.dangerousRm !== false) {
    const dangerousHits = dangerousCommandHits(command, cwd);
    if (dangerousHits.length > 0) {
      recordDeny(event, command, "dangerous-rm");
      writeJson(
        preToolDeny(dangerousCommandDenyMessage(dangerousHits, command)),
      );
      process.exit(0);
    }
  }

  const hit = matchRule(command, rules);
  if (hit) {
    if (hit.mode === "allow") process.exit(0);
    if (hit.mode === "deny") {
      recordDeny(event, command, hit.id || "command-rule");
      writeJson(preToolDeny(formatFinding(hit, command)));
      process.exit(0);
    }
    if (hit.mode === "report") {
      writeJson(
        additionalContextOutput("PreToolUse", formatFinding(hit, command)),
      );
      process.exit(0);
    }
  }

  if (settings.engines.mysqlReplicationPreflight !== false) {
    const mysql = mysqlReplicationPreflightFinding(command, event);
    if (mysql) {
      recordDeny(event, command, mysql.id);
      writeJson(preToolDeny(mysqlPreflightDenyMessage(mysql, command)));
      process.exit(0);
    }
  }
}

main().catch(() => process.exit(0));

import { extractFileTargets, extractShellCommand, extractToolName, isFileTool, isShellTool } from "./hook-io.js";
import { commandMentionsRoot, isGenericMutationCommand, pathUnderRoot } from "@harness/core/path-protect";

export function targetsHitAuditRoot(event, auditRootAbs) {
  return extractFileTargets(event).filter((target) => pathUnderRoot(target, auditRootAbs));
}

export function commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) {
  return commandMentionsRoot(command, auditRootRel, auditRootAbs);
}

export function isAuditMutationCommand(command) {
  return isGenericMutationCommand(command);
}

export function shellMutatesAuditRoot(command, auditRootRel, auditRootAbs) {
  return commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) && isAuditMutationCommand(command);
}

export function protectDecision(event, auditRootRel, auditRootAbs) {
  const toolName = extractToolName(event);
  if (isFileTool(toolName)) {
    const hits = targetsHitAuditRoot(event, auditRootAbs);
    if (hits.length > 0) {
      return {
        deny: true,
        reason: [
          "[Command Exec Audit] Audit trail is protected",
          "",
          `Blocked path(s): ${hits.join(", ")}`,
          `Root: ${auditRootRel}/`,
          "",
          "Write policy: only the audit plugin may append lines or rewrite the last line.",
          "Do not Read/Edit/Write session JSONL files under the audit root.",
        ].join("\n"),
      };
    }
  }
  if (isShellTool(toolName)) {
    const command = extractShellCommand(event);
    if (command && shellMutatesAuditRoot(command, auditRootRel, auditRootAbs)) {
      return {
        deny: true,
        reason: [
          "[Command Exec Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Shell mutation of the audit trail is denied.",
        ].join("\n"),
      };
    }
  }
  return { deny: false };
}

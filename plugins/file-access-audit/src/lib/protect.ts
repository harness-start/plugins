import { relative } from "node:path";

import { extractFileTargets, extractShellCommand, extractToolName, isFileTool, isShellTool } from "./hook-io.js";
import { commandMentionsRoot, isGenericMutationCommand, pathUnderRoot } from "@harness/core/path-protect";
import type { HookEvent } from "@harness/core/hook-event";

export type ProtectDecision =
  | { deny: true; reason: string }
  | { deny: false };

export function targetsHitAuditRoot(event: HookEvent, auditRootAbs: string): string[] {
  return extractFileTargets(event).filter((target) => pathUnderRoot(target, auditRootAbs));
}

export function commandMentionsAuditRoot(command: string, auditRootRel: string, auditRootAbs: string): boolean {
  return commandMentionsRoot(command, auditRootRel, auditRootAbs);
}

export function isAuditMutationCommand(command: string): boolean {
  return isGenericMutationCommand(command);
}

export function shellMutatesAuditRoot(command: string, auditRootRel: string, auditRootAbs: string): boolean {
  return commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) && isAuditMutationCommand(command);
}

export function protectDecision(event: HookEvent, auditRootRel: string, auditRootAbs: string): ProtectDecision {
  const toolName = extractToolName(event);
  if (isFileTool(toolName)) {
    const hits = targetsHitAuditRoot(event, auditRootAbs);
    if (hits.length > 0) {
      return {
        deny: true,
        reason: [
          "[File Access Audit] Audit trail is protected",
          "",
          `Blocked path(s): ${hits.map((path) => relative(process.cwd(), path) || path).join(", ")}`,
          `Root: ${auditRootRel}/`,
          "",
          "Write policy: only the audit plugin may append lines or rewrite the last line.",
          "Do not Read/Edit/Write session JSONL files or other files under the audit root.",
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
          "[File Access Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Shell mutation of the audit trail is denied.",
          "Let the audit plugin own append / last-line updates.",
        ].join("\n"),
      };
    }
  }
  return { deny: false };
}

import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { extractCwd, extractFileTargets, extractShellCommand, extractToolName, isFileTool, isShellTool } from "./hook-io.js";
import { commandMentionsRoot, isGenericMutationCommand, pathUnderRoot } from "@harness/core/path-protect";
import type { HookEvent } from "@harness/core/hook-event";

export type ProtectDecision =
  | { deny: true; reason: string }
  | { deny: false };

function canonicalPath(path: string): string {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try { return resolve(realpathSync(cursor), ...suffix); } catch {}
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(path);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
}

function pathWithin(candidate: string, root: string): boolean {
  return pathUnderRoot(candidate, root)
    || pathUnderRoot(canonicalPath(candidate), canonicalPath(root));
}

export function targetsHitAuditRoot(event: HookEvent, auditRootAbs: string): string[] {
  return extractFileTargets(event).filter((target) => pathWithin(target, auditRootAbs));
}

export function commandMentionsAuditRoot(command: string, auditRootRel: string, auditRootAbs: string): boolean {
  return commandMentionsRoot(command, auditRootRel, auditRootAbs);
}

export function isAuditMutationCommand(command: string): boolean {
  return isGenericMutationCommand(command);
}

export function shellMutatesAuditRoot(command: string, auditRootRel: string, auditRootAbs: string, cwd?: string): boolean {
  if (!isAuditMutationCommand(command)) return false;
  return commandMentionsAuditRoot(command, auditRootRel, auditRootAbs)
    || (cwd !== undefined && pathWithin(cwd, auditRootAbs));
}

export function protectDecision(event: HookEvent, auditRootRel: string, auditRootAbs: string): ProtectDecision {
  const toolName = extractToolName(event);
  if (isFileTool(toolName)) {
    const hits = targetsHitAuditRoot(event, auditRootAbs);
    if (hits.length > 0) {
      return {
        deny: true,
        reason: [
          "[Agent Activity Audit] Audit trail is protected",
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
    if (command && shellMutatesAuditRoot(command, auditRootRel, auditRootAbs, extractCwd(event))) {
      return {
        deny: true,
        reason: [
          "[Agent Activity Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Shell mutation of the audit trail is denied.",
        ].join("\n"),
      };
    }
  }
  return { deny: false };
}

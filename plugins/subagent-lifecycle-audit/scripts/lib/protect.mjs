import { isAbsolute, relative, resolve } from "node:path";

import {
  extractCwd,
  extractFileTargets,
  extractShellCommand,
  extractToolName,
  isFileTool,
  isShellTool,
} from "./hook-io.mjs";

function underAuditRoot(filePath, auditRootAbs, cwd) {
  const absolute = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(cwd, filePath.replace(/^\.\//u, ""));
  const root = resolve(auditRootAbs);
  const rel = relative(root, absolute).replaceAll("\\", "/");
  return rel === "" || (!rel.startsWith("../") && !isAbsolute(rel));
}

export function targetsHitAuditRoot(event, auditRootAbs) {
  const cwd = resolve(extractCwd(event));
  return extractFileTargets(event).filter((target) =>
    underAuditRoot(target, auditRootAbs, cwd),
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function auditRootMarkers(auditRootRel, auditRootAbs) {
  const normalized = String(auditRootRel ?? "")
    .replace(/^\.\//u, "")
    .replace(/\/+$/u, "");
  return [
    auditRootRel,
    normalized,
    auditRootAbs,
    normalized ? `${normalized}/` : null,
    normalized ? `./${normalized}` : null,
  ].filter(Boolean);
}

export function commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  for (const marker of auditRootMarkers(auditRootRel, auditRootAbs)) {
    const escaped = escapeRegExp(marker);
    const pattern = new RegExp(
      `(?:^|[\\s;|&\`"'(){}\\[\\]])${escaped}(?:$|[\\s;|&\`"'(){}\\[\\]/])`,
      "u",
    );
    if (pattern.test(text)) return true;
  }
  return false;
}

export function isAuditMutationCommand(command) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  if (/(?:^|[^0-9])>{1,2}\s*(?:"[^"]*"|'[^']*'|\S+)/u.test(text)) return true;
  if (/<<\s*['"]?\w+/u.test(text)) return true;
  if (
    /(?:^|[\s;|&`(])(?:\/(?:usr\/)?bin\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install)\b/iu
      .test(text)
  ) {
    return true;
  }
  if (/(?:^|[\s;|&`(])find\b[\s\S]*\s-delete\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])git\s+clean\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])sed\s+(?:-i\b|\S*i\S*\b)/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:perl|ruby|python3?)\s+[^\n]*\s-i\b/iu.test(text)) return true;
  return false;
}

export function protectDecision(event, auditRootRel, auditRootAbs) {
  const toolName = extractToolName(event);
  if (isFileTool(toolName)) {
    const hits = targetsHitAuditRoot(event, auditRootAbs);
    if (hits.length > 0) {
      return {
        deny: true,
        reason: [
          "[Subagent Lifecycle Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Only the lifecycle hook may write files under this root.",
        ].join("\n"),
      };
    }
  }
  if (isShellTool(toolName)) {
    const command = extractShellCommand(event);
    if (
      commandMentionsAuditRoot(command, auditRootRel, auditRootAbs)
      && isAuditMutationCommand(command)
    ) {
      return {
        deny: true,
        reason: [
          "[Subagent Lifecycle Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Shell mutation of the lifecycle audit trail is denied.",
        ].join("\n"),
      };
    }
  }
  return { deny: false };
}

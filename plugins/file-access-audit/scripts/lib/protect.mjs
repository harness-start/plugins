import { isAbsolute, relative, resolve } from "node:path";

import {
  extractFileTargets,
  extractShellCommand,
  extractToolName,
  isFileTool,
  isShellTool,
} from "./hook-io.mjs";

function underAuditRoot(filePath, auditRootAbs) {
  const abs = resolve(filePath);
  const root = resolve(auditRootAbs);
  const rel = relative(root, abs).replaceAll("\\", "/");
  return rel === "" || (!rel.startsWith("../") && !isAbsolute(rel));
}

export function targetsHitAuditRoot(event, auditRootAbs) {
  const hits = [];
  for (const target of extractFileTargets(event)) {
    if (underAuditRoot(target, auditRootAbs)) hits.push(target);
  }
  return hits;
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
    normalized ? `./${normalized}/` : null,
  ].filter(Boolean);
}

export function commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  for (const marker of auditRootMarkers(auditRootRel, auditRootAbs)) {
    const escaped = escapeRegExp(marker);
    const re = new RegExp(
      `(?:^|[\\s;|&\`"'(){}\\[\\]])${escaped}(?:$|[\\s;|&\`"'(){}\\[\\]//])`,
      "u",
    );
    if (re.test(text)) return true;
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

export function shellMutatesAuditRoot(command, auditRootRel, auditRootAbs) {
  if (!commandMentionsAuditRoot(command, auditRootRel, auditRootAbs)) return false;
  return isAuditMutationCommand(command);
}

export function protectDecision(event, auditRootRel, auditRootAbs) {
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

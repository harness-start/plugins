import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isInsideJournal } from "./journal.mjs";
import {
  extractFileTargets,
  extractCwd,
  extractShellCommand,
  extractToolInput,
  extractToolName,
  extractToolUseId,
  isReadFileTool,
  isShellTool,
  isWriteFileTool,
  physicalPath,
} from "./hook-io.mjs";

const QUERY_SCRIPT = fileURLToPath(new URL("../compact-context-journal-query.mjs", import.meta.url));

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function rootMention(command, location) {
  const text = String(command);
  const markers = [location.root, relative(location.workspaceRoot, location.root), ".compact-context-journal"];
  return markers.some((marker) => text.includes(marker));
}

function physicalRootMention(event, location) {
  const command = String(extractShellCommand(event) ?? "");
  const tokens = command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s;|&<>`]+/gu) ?? [];
  const cwd = resolve(extractCwd(event));
  for (const raw of tokens) {
    const token = raw.length > 1 && ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
    if (!token || token.startsWith("-") || /[$*?{}[\]]/u.test(token) || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) continue;
    const candidate = resolve(cwd, token.replace(/^\.\//u, ""));
    if (isInsideJournal(physicalPath(candidate), location)) return true;
  }
  return false;
}

function globRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else if (char === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end < 0) source += "\\[";
      else {
        let body = pattern.slice(index + 1, end);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        source += `[${body}]`;
        index = end;
      }
    } else source += char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }
  return new RegExp(`${source}$`, "u");
}

function hiddenGlobMayHitRoot(event, location) {
  const command = String(extractShellCommand(event) ?? "");
  const tokens = command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s;|&<>`]+/gu) ?? [];
  const cwd = resolve(extractCwd(event));
  for (const raw of tokens) {
    const token = raw.length > 1 && ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
    if (!/[?*[]/u.test(token) || /[$`]/u.test(token)) continue;
    const parent = resolve(cwd, dirname(token));
    if (physicalPath(parent) !== physicalPath(location.workspaceRoot)) continue;
    const name = token.slice(token.lastIndexOf("/") + 1);
    try {
      if (globRegex(name).test(".compact-context-journal")) return true;
    } catch {
      // Invalid shell globs are not treated as a positive match.
    }
  }
  return false;
}

function shellMutation(command) {
  const text = String(command ?? "");
  return (
    /(?:^|[^<])>{1,2}\s*(?:[^&]|$)/u.test(text) ||
    /<<\s*['"]?\w+/u.test(text) ||
    /(?:^|[\s;|&`(])(?:\/[^\s]+\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install)\b/iu.test(text) ||
    /(?:^|[\s;|&`(])find\b[\s\S]*(?:-delete|-exec|-execdir)\b/iu.test(text) ||
    /(?:^|[\s;|&`(])sed\s+(?:-[A-Za-z]*i[A-Za-z]*\b|--in-place\b)/iu.test(text) ||
    /(?:^|[\s;|&`(])(?:perl|ruby|python3?|node)\b[\s\S]*(?:writeFile|unlink|rename|truncate|rmdir|mkdir|open\s*\([^)]*["']w|\s-i\b)/iu.test(text)
  );
}

function indirectIgnoredMutation(command, location) {
  const text = String(command ?? "");
  const clean = text.match(/\bgit\s+clean\b([^\n]*)/iu)?.[1] ?? "";
  const cleanIncludesIgnored = /(?:^|\s)-[A-Za-z]*[xX][A-Za-z]*(?:\s|$)/u.test(clean) || /--ignored\b/iu.test(clean);
  const cleanDryRun = /(?:^|\s)-[A-Za-z]*n[A-Za-z]*(?:\s|$)/u.test(clean) || /--dry-run\b/iu.test(clean);
  if (cleanIncludesIgnored && !cleanDryRun) {
    return "git clean would include the ignored journal";
  }
  if (/\bgit\s+stash\b[^\n]*(?:--all\b|(?:^|\s)-[A-Za-z]*a[A-Za-z]*(?:\s|$))/iu.test(text)) return "git stash --all would include the ignored journal";
  if (/\bgit\s+add\b[^\n]*(?:--force\b|\s-f\b)/iu.test(text)) {
    const broad = /(?:\s|^)(?:\.|-A|--all|:\/)(?:\s|$)/u.test(text);
    if (broad || rootMention(text, location)) return "git add --force must not capture the journal";
  }
  const escapedRoot = location.workspaceRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const broadDelete = new RegExp(`\\b(?:rm|mv)\\b[^\\n]*(?:-r|-R|--recursive)[^\\n]*(?:${escapedRoot}|\\.\\s*(?:$|[;&|]))`, "u");
  if (broadDelete.test(text)) return "broad recursive mutation would include the journal";
  if (/\bfind\b[^\n]*(?:-delete|-exec\s+rm|-execdir\s+rm)/iu.test(text) && !rootMention(text, location)) {
    return "broad find mutation may include the journal";
  }
  return null;
}

export function journalProtectionDecision(event, location) {
  const tool = extractToolName(event);
  if (!isReadFileTool(tool) && toolMayMutate(event)) {
    const hit = extractFileTargets(event).find((path) =>
      isInsideJournal(path, location) || isInsideJournal(physicalPath(path), location),
    );
    if (hit) {
      return {
        deny: true,
        reason: `[Compact Context Journal] Protected append-only journal\n\nBlocked target: ${hit}\nOnly the plugin may append framed events. Earlier verified content must never be edited, replaced, moved, or deleted.`,
      };
    }
  }
  if (isShellTool(tool)) {
    const command = extractShellCommand(event) ?? "";
    const indirect = indirectIgnoredMutation(command, location);
    if (indirect) {
      return { deny: true, reason: `[Compact Context Journal] Protected ignored journal\n\nBlocked: ${indirect}.` };
    }
    const journalTargeted = rootMention(command, location) || physicalRootMention(event, location) || hiddenGlobMayHitRoot(event, location);
    if (journalTargeted && !isPureReadShell(command)) {
      return {
        deny: true,
        reason: "[Compact Context Journal] Shell mutation of the append-only journal is denied. Use read-only retrieval only.",
      };
    }
  }
  return { deny: false };
}

export function isPureReadShell(command) {
  const text = String(command ?? "").trim();
  if (!text || shellMutation(text)) return false;
  if (/\b(?:git\s+(?:add|commit|push|pull|fetch|merge|rebase|reset|checkout|switch|clean|stash)|curl\b|wget\b|ssh\b|scp\b|npm\b|pnpm\b|yarn\b)\b/iu.test(text)) return false;
  const segments = text.split(/&&|\|\||;|\|/u).map((part) => part.trim()).filter(Boolean);
  return segments.length > 0 && segments.every((segment) => {
    const withoutAssignments = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/u, "");
    const exactQuery = withoutAssignments.startsWith(`node ${shellQuote(QUERY_SCRIPT)} index `) || withoutAssignments.startsWith(`node ${shellQuote(QUERY_SCRIPT)} event `);
    return exactQuery || /^(?:(?:pwd|ls|stat|wc|rg|grep|head|tail|test|realpath|readlink|sha256sum|jq)(?:\s|$)|sed\s+-n(?:\s|$)|find(?:\s|$)(?![\s\S]*(?:-delete|-exec|-execdir))|git\s+(?:status|diff|log|show|rev-parse)(?:\s|$)|git\s+branch\s+--show-current(?:\s|$))/u.test(withoutAssignments);
  });
}

export function toolMayMutate(event) {
  const tool = extractToolName(event);
  if (isWriteFileTool(tool)) return true;
  if (isReadFileTool(tool)) return false;
  if (isShellTool(tool)) return !isPureReadShell(extractShellCommand(event));
  if (/^(?:Glob|Grep|LS|WebSearch|WebFetch|list_agents|get_goal|view_image)$/iu.test(tool)) return false;
  return true;
}

function samePath(candidate, expected) {
  return resolve(candidate) === resolve(expected) || physicalPath(candidate) === physicalPath(expected);
}

export function recoveryReadCandidate(event, location, recovery) {
  if (!recovery) return null;
  const toolUseId = extractToolUseId(event);
  if (!toolUseId) return null;
  const start = Number(recovery.cardStartLine);
  const end = Number(recovery.cardEndLine);
  if (isReadFileTool(extractToolName(event))) {
    const input = extractToolInput(event);
    const path = input?.file_path ?? input?.filePath ?? input?.path;
    const offset = Number(input?.offset);
    const limit = Number(input?.limit);
    if (typeof path === "string" && samePath(path, location.path) && Number.isSafeInteger(offset) && Number.isSafeInteger(limit) && offset <= start && offset + limit - 1 >= end) {
      return { toolUseId, compactId: recovery.compactId, start, end, kind: "Read" };
    }
  }
  if (isShellTool(extractToolName(event))) {
    const command = String(extractShellCommand(event) ?? "").trim();
    const expected = `sed -n '${start},${end}p' -- ${shellQuote(location.path)}`;
    if (command === expected) return { toolUseId, compactId: recovery.compactId, start, end, kind: "sed" };
  }
  return null;
}

export function recoveryGateDecision(event, location, recovery) {
  if (!recovery) return { deny: false, candidate: null };
  const candidate = recoveryReadCandidate(event, location, recovery);
  if (candidate) return { deny: false, candidate };
  if (toolMayMutate(event)) {
    return {
      deny: true,
      candidate: null,
      reason: [
        "[Compact Context Journal] Recovery receipt required before mutation or external effects.",
        `Compact: ${recovery.compactId}`,
        `Read the current Recovery Card first: sed -n '${recovery.cardStartLine},${recovery.cardEndLine}p' -- ${shellQuote(location.path)}`,
        "Only a successful read covering this exact card clears the gate.",
      ].join("\n"),
    };
  }
  return { deny: false, candidate: null };
}

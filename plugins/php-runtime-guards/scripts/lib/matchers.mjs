/**
 * Path and tool matchers shared by the PHP checks.
 */

import { basename, extname } from "node:path";

export function matchExt(filePath, exts) {
  return exts.includes(extname(filePath).toLowerCase());
}

export function matchName(filePath, names) {
  return names.includes(basename(filePath));
}

/** Edit/Write-style write tools across Claude Code and Codex. */
const WRITE_TOOLS =
  /^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|create_file|search_replace)$/i;

export function isWriteTool(toolName) {
  return typeof toolName === "string" && WRITE_TOOLS.test(toolName);
}

export function isShellTool(toolName) {
  return typeof toolName === "string" && /^(Bash|Shell|bash|shell)$/i.test(toolName);
}

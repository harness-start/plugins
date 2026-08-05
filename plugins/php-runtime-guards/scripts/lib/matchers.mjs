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
  /^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|create_file|search_replace|apply_patch)$/i;

const SHELL_TOOLS =
  /^(Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/i;

/**
 * Normalize host tool names so Claude (ApplyPatch/Bash) and Codex
 * (apply_patch/shell_command/exec_command) share one switch surface.
 */
export function normalizeToolName(toolName) {
  if (typeof toolName !== "string" || !toolName) return "";
  const lower = toolName.trim().toLowerCase();
  const map = {
    apply_patch: "ApplyPatch",
    applypatch: "ApplyPatch",
    write: "Write",
    edit: "Edit",
    multiedit: "MultiEdit",
    notebookedit: "NotebookEdit",
    create_file: "Write",
    search_replace: "Edit",
    bash: "Bash",
    shell: "Shell",
    shell_command: "Shell",
    exec_command: "Shell",
    exec: "Shell",
    local_shell: "Shell",
  };
  if (map[lower]) return map[lower];
  // Preserve original casing for already-canonical Claude names.
  if (/^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|Bash|Shell)$/.test(toolName)) {
    return toolName;
  }
  return toolName;
}

export function isWriteTool(toolName) {
  return typeof toolName === "string" && WRITE_TOOLS.test(toolName);
}

export function isShellTool(toolName) {
  return typeof toolName === "string" && SHELL_TOOLS.test(toolName);
}

/** Edit/Write-style write tools across Claude Code and Codex. */
const WRITE_TOOLS =
  /^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|create_file|search_replace|apply_patch)$/i;

const SHELL_TOOLS =
  /^(Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/i;

export function isWriteTool(toolName) {
  return typeof toolName === "string" && WRITE_TOOLS.test(toolName);
}

export function isShellTool(toolName) {
  return typeof toolName === "string" && SHELL_TOOLS.test(toolName);
}

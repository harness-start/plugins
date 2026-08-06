/**
 * apply_patch target extraction shared by hook entries and tests.
 *
 * Codex non-interactive mode applies file patches through the Bash tool with
 * an inline `*** Begin Patch` payload; PostToolUse needs the target paths to
 * run its checks there.
 */

import { resolve } from "node:path";

export function patchTargetPaths(command, cwd) {
  if (typeof command !== "string" || !command.includes("*** Begin Patch")) return [];
  const paths = [];
  for (const line of command.split("\n")) {
    // Codex serializes the patch payload with literal `\n` at line ends.
    const stripLiteralN = (value) => value.replace(/\\n$/, "").trim();
    const fileMatch = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/);
    if (fileMatch) paths.push(stripLiteralN(fileMatch[1]));
    const moveMatch = line.match(/^\*\*\*\s+Move to:\s+(.+)$/);
    if (moveMatch) paths.push(stripLiteralN(moveMatch[1]));
  }
  return paths.map((path) => (path.startsWith("/") ? path : resolve(cwd, path)));
}

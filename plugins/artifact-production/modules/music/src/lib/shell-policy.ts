import { resolve } from "node:path";

import { evaluateRegisteredWriter, expandKnownPluginRoot, parseShellWords } from "@harness/core/artifact-shell";

export const MUSIC_WRITERS = [
  "project-advice.mjs",
  "project-init.mjs",
  "project-lint.mjs",
  "project-optimize.mjs",
  "project-preview.mjs",
  "project-reference.mjs",
  "project-render.mjs",
  "project-review.mjs",
  "project-stage.mjs",
  "project-release.mjs",
] as const;

const CAPABILITIES: Record<string, string | undefined> = {
  "project-advice.mjs": "music-advice",
  "project-init.mjs": "music-init",
  "project-optimize.mjs": "music-optimize",
  "project-preview.mjs": "music-preview",
  "project-reference.mjs": "music-reference",
  "project-render.mjs": "music-render",
  "project-review.mjs": "music-review",
  "project-stage.mjs": "music-stage",
  "project-release.mjs": "music-release",
};

export type MusicShellDecision =
  | { decision: "outside" | "read-only" }
  | { decision: "registered"; writer: string; projectRoot: string; capability?: string; argv: string[] }
  | { decision: "deny"; code: string; message: string };

export function evaluateMusicShell({ command, cwd, workspaceRoot, toolDirectory }: { command: string; cwd: string; workspaceRoot: string; toolDirectory: string; activeProjectCount?: number }): MusicShellDecision {
  const cwdInScope = /(?:^|[\\/])artifacts[\\/]music[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
  const commandInScope = /artifacts[\\/]music[\\/]/u.test(command) || cwdInScope;
  if (!commandInScope) return { decision: "outside" };
  const expanded = expandKnownPluginRoot(command);
  const words = parseShellWords(expanded);
  if (!words) return { decision: "deny", code: "SHELL_SHAPE_DENIED", message: "compound commands, redirection, interpolation, and shell control syntax are not allowed in music scope" };
  const safeReadOnly = /^(?:pwd|ls|cat|head|tail|stat|file|sha256sum)$/u.test(words[0] ?? "")
    || (words[0] === "git" && ["status", "diff"].includes(words[1] ?? ""));
  if (safeReadOnly) return { decision: "read-only" };
  const approved = evaluateRegisteredWriter({ command: expanded, cwd, workspaceRoot, carrier: "music", writers: MUSIC_WRITERS, toolDirectory });
  if (!approved.ok) return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "music scope allows only an exact registered writer invocation or a narrow read-only command" };
  const extra = words.slice(3);
  const shapeValid = approved.writer === "project-init.mjs"
    ? extra.every((word) => ["--skip-install", "--install-browser"].includes(word)) && new Set(extra).size === extra.length
    : approved.writer === "project-reference.mjs"
      ? words.length === 5
      : ["project-advice.mjs", "project-review.mjs"].includes(approved.writer)
      ? words.length === 4
      : approved.writer === "project-stage.mjs"
        ? words.length === 4 && words[3] === "release"
        : approved.writer === "project-preview.mjs"
          ? words.length === 3 || (words.length === 4 && words[3] === "--evidence-only")
          : words.length === 3;
  if (!shapeValid) return { decision: "deny", code: "WRITER_ARGUMENTS_INVALID", message: "registered music writers require their exact documented argument shape" };
  const script = resolve(words[1] ?? "");
  const capability = CAPABILITIES[approved.writer];
  return capability
    ? { decision: "registered", writer: approved.writer, projectRoot: approved.projectRoot, capability, argv: [script, ...words.slice(2)] }
    : { decision: "registered", writer: approved.writer, projectRoot: approved.projectRoot, argv: [script, ...words.slice(2)] };
}

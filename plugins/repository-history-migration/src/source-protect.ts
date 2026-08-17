import { shellCommandInvocations } from "@harness/core/shell-parse";

export type SourceProtectFinding = {
  id: "SOURCE_FILTER_REPO" | "SOURCE_RESET_HARD" | "SOURCE_FORCE_PUSH";
  reason: string;
  recovery: string;
};

const PLUGIN_EXECUTE = /git-history-migration-execute\.mjs(?:\s|$)/u;

function gitSubcommand(args: readonly string[]): { subcommand: string; rest: string[] } {
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    const next = args[index + 1];
    if (token === "-C" && next) {
      index += 2;
      continue;
    }
    if (token !== undefined && ["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
      index += 2;
      continue;
    }
    if (token !== undefined && /^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
      index += 1;
      continue;
    }
    break;
  }
  return { subcommand: args[index] ?? "", rest: args.slice(index + 1) };
}

export function classifySourceProtectCommand(command: string): SourceProtectFinding | null {
  if (!command.trim()) return null;
  if (PLUGIN_EXECUTE.test(command)) return null;

  for (const invocation of shellCommandInvocations(command)) {
    const executable = invocation.executable;
    if (executable === "git-filter-repo") {
      return {
        id: "SOURCE_FILTER_REPO",
        reason: "git filter-repo rewrites history and must not run against the source repository",
        recovery: "run node <plugin>/dist/cli/git-history-migration-execute.mjs with a sealed preflight",
      };
    }
    if (executable !== "git") continue;
    const { subcommand, rest } = gitSubcommand(invocation.args);
    if (subcommand === "filter-repo" || subcommand === "filter-branch") {
      return {
        id: "SOURCE_FILTER_REPO",
        reason: `${subcommand} rewrites history and must not run against the source repository`,
        recovery: "run node <plugin>/dist/cli/git-history-migration-execute.mjs with a sealed preflight",
      };
    }
    if (subcommand === "reset" && rest.includes("--hard")) {
      return {
        id: "SOURCE_RESET_HARD",
        reason: "git reset --hard discards source worktree state",
        recovery: "leave the source repository unchanged; use the plugin execute CLI in a separate clone",
      };
    }
    if (subcommand === "push") {
      const force = rest.some((arg) => arg === "--force" || arg === "-f" || /^-[^-]*f/u.test(arg));
      if (force) {
        return {
          id: "SOURCE_FORCE_PUSH",
          reason: "force-push can rewrite the source remote",
          recovery: "do not push from the source during migration; publish only the new target repository when authorized",
        };
      }
    }
  }
  return null;
}

export function formatSourceProtectDeny(finding: SourceProtectFinding): string {
  return [
    `[repository-history-migration] ${finding.id}: source repository stays read-only`,
    "",
    `reason: ${finding.reason}`,
    "",
    "blockingContract:",
    "  observedFacts: The shell command would mutate or rewrite the source Git repository.",
    "  harm: History extraction must leave the source worktree, refs, and remotes unchanged.",
    "  unblockWhen: Use the sealed plugin execute CLI, or choose a non-destructive source command.",
    `  recovery: ${finding.recovery}`,
  ].join("\n");
}

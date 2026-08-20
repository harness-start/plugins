import { shellCommandInvocations } from "@harness/core/shell-parse";

export type MergeProtectFinding = {
  id: "MERGE_SHA_REQUIRED" | "PUSH_SHA_REQUIRED";
  reason: string;
  recovery: string;
};

const HEAD_SHA = /\b[0-9a-f]{7,40}\b/iu;
const DEFAULT_BRANCH = /^(?:main|master)$/u;

function gitSubcommand(args: readonly string[]): { subcommand: string; rest: string[] } {
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    const next = args[index + 1];
    if (token === "-C" && next) {
      index += 2;
      continue;
    }
    if (token !== undefined && ["-c", "--git-dir", "--work-tree"].includes(token)) {
      index += 2;
      continue;
    }
    break;
  }
  return { subcommand: args[index] ?? "", rest: args.slice(index + 1) };
}

function pushTouchesDefaultBranch(args: readonly string[]): boolean {
  return args.some((arg) => {
    if (DEFAULT_BRANCH.test(arg)) return true;
    const colon = arg.lastIndexOf(":");
    if (colon <= 0) return false;
    return DEFAULT_BRANCH.test(arg.slice(colon + 1));
  });
}

export function classifyDefaultBranchPublish(command: string): MergeProtectFinding | null {
  if (!command.trim()) return null;
  const hasSha = HEAD_SHA.test(command);

  for (const invocation of shellCommandInvocations(command)) {
    const name = invocation.executable;
    const args = invocation.args;
    if (name === "gh" && args[0] === "pr" && args[1] === "merge" && !hasSha) {
      return {
        id: "MERGE_SHA_REQUIRED",
        reason: "gh pr merge without a bound head SHA can merge a different commit than the observed pipeline",
        recovery: "include the current head SHA, for example gh pr merge --match-head-commit <sha>",
      };
    }
    if (name === "glab" && args[0] === "mr" && args[1] === "merge" && !hasSha) {
      return {
        id: "MERGE_SHA_REQUIRED",
        reason: "glab mr merge without a bound head SHA can merge a different commit than the observed pipeline",
        recovery: "include the current head SHA in the same command, for example glab mr merge --sha <sha>",
      };
    }
    if (name === "git") {
      const { subcommand, rest } = gitSubcommand(args);
      if (subcommand === "push" && pushTouchesDefaultBranch(rest) && !hasSha) {
        return {
          id: "PUSH_SHA_REQUIRED",
          reason: "git push to main/master without a bound SHA can update the default branch from a different head",
          recovery: "push an explicit object name, for example git push origin <sha>:main",
        };
      }
    }
  }
  return null;
}

export function formatMergeProtectDeny(finding: MergeProtectFinding): string {
  return [
    `[ci-gated-delivery] ${finding.id}: default-branch publish needs a head SHA`,
    "",
    `reason: ${finding.reason}`,
    "",
    "blockingContract:",
    "  observedFacts: The command publishes to a merge request or default branch without a hex head SHA in the same argv.",
    "  harm: A merge or default-branch update can land a different commit than the one just observed.",
    "  unblockWhen: Repeat the command with the current head SHA bound in the same argv.",
    `  recovery: ${finding.recovery}`,
    "",
    "This hook does not prove that required CI jobs passed.",
  ].join("\n");
}

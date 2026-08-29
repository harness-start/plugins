import { shellCommandInvocations } from "@harness/core/shell-parse";

export type MergeProtectFinding = {
  id: "MERGE_SHA_REQUIRED" | "PUSH_SHA_REQUIRED";
  reason: string;
  recovery: string;
};

const HEAD_SHA = /^[0-9a-f]{7,40}$/iu;
const DEFAULT_BRANCH = /^(?:main|master)$/u;

function isDefaultBranchRef(value: string): boolean {
  return DEFAULT_BRANCH.test(value) || /^(?:refs\/heads\/)?(?:main|master)$/u.test(value);
}

function optionBindsHeadSha(args: readonly string[], option: string): boolean {
  return args.some((arg, index) => {
    if (arg === option) return HEAD_SHA.test(args[index + 1] ?? "");
    return arg.startsWith(`${option}=`) && HEAD_SHA.test(arg.slice(option.length + 1));
  });
}

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
    if (isDefaultBranchRef(arg)) return true;
    const colon = arg.lastIndexOf(":");
    if (colon <= 0) return false;
    return isDefaultBranchRef(arg.slice(colon + 1));
  });
}

function pushBindsHeadSha(args: readonly string[]): boolean {
  return args.some((arg) => {
    const colon = arg.lastIndexOf(":");
    if (colon <= 0 || !isDefaultBranchRef(arg.slice(colon + 1))) return false;
    return HEAD_SHA.test(arg.slice(0, colon).replace(/^\+/u, ""));
  });
}

export function classifyDefaultBranchPublish(command: string): MergeProtectFinding | null {
  if (!command.trim()) return null;

  for (const invocation of shellCommandInvocations(command)) {
    const name = invocation.executable;
    const args = invocation.args;
    if (
      name === "gh"
      && args[0] === "pr"
      && args[1] === "merge"
      && !optionBindsHeadSha(args, "--match-head-commit")
    ) {
      return {
        id: "MERGE_SHA_REQUIRED",
        reason: "gh pr merge without a bound head SHA can merge a different commit than the observed pipeline",
        recovery: "include the current head SHA, for example gh pr merge --match-head-commit <sha>",
      };
    }
    if (
      name === "glab"
      && args[0] === "mr"
      && args[1] === "merge"
      && !optionBindsHeadSha(args, "--sha")
    ) {
      return {
        id: "MERGE_SHA_REQUIRED",
        reason: "glab mr merge without a bound head SHA can merge a different commit than the observed pipeline",
        recovery: "include the current head SHA in the same command, for example glab mr merge --sha <sha>",
      };
    }
    if (name === "git") {
      const { subcommand, rest } = gitSubcommand(args);
      if (subcommand === "push" && pushTouchesDefaultBranch(rest) && !pushBindsHeadSha(rest)) {
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

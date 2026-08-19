import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { shellCommandInvocations } from "../lib/shell-parse.js";

const TYPES = [
  "feat", "fix", "docs", "style", "refactor", "perf", "test", "build",
  "ci", "chore", "revert",
];
const BRANCH = new RegExp(`^(?:${TYPES.join("|")})/[a-z0-9][a-z0-9._\\-/]{1,79}$`, "u");
const COMMIT = new RegExp(`^(?:${TYPES.join("|")})(?:\\([^)]+\\))?!?:\\s.+`, "u");
const GENERIC = /^(?:fix|update|move|迁移|修复|优化|调整|兼容|补充|完善|修改|cleanup|clean up|refactor|misc|stuff)$/iu;
const GARBLED = /\uFFFD|[\x00-\x08\x0E-\x1F\x7F]|[\uE000-\uF8FF]|\u00C3[\u0080-\u00BF]/u;

export type DeliveryAction = "deny" | "report";

export type DeliveryFinding = {
  action: DeliveryAction;
  id: string;
  reason: string;
  command?: string | undefined;
  recovery: string;
};

export type GitInvocation = {
  cwd: string;
  subcommand: string;
  args: string[];
};

function finding(
  action: DeliveryAction,
  id: string,
  reason: string,
  command: string,
  recovery: string,
): DeliveryFinding {
  return { action, id, reason, command, recovery };
}

export function gitInvocations(command: unknown, initialCwd: string): GitInvocation[] {
  if (typeof command !== "string" || !command.trim()) return [];
  return shellCommandInvocations(command).flatMap((invocation) => {
    if (invocation.executable !== "git" || invocation.stdinDriven) return [];
    const rawArgs = invocation.args;
    let cursor = 0;
    let cwd = resolve(initialCwd);
    while (cursor < rawArgs.length) {
      const token = rawArgs[cursor];
      const next = rawArgs[cursor + 1];
      if (token === "-C" && next) {
        cwd = resolve(cwd, next);
        cursor += 2;
        continue;
      }
      if (token !== undefined && ["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
        cursor += 2;
        continue;
      }
      if (token !== undefined && /^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
        cursor += 1;
        continue;
      }
      break;
    }
    return [{ cwd, subcommand: rawArgs[cursor] ?? "", args: rawArgs.slice(cursor + 1) }];
  });
}

function gitAdd(invocation: GitInvocation, command: string): DeliveryFinding | null {
  if (invocation.subcommand !== "add") return null;
  const args = invocation.args;
  if (args.some((token) => [".", "./", "*", "./*"].includes(token) || token.startsWith("--pathspec-from-file"))) {
    return finding(
      "deny", "Git Add Guard", "bulk staging may include changes from other tasks", command,
      "stage each file explicitly with git add <specific-file-path>",
    );
  }
  const hasBulk = args.some((token) =>
    ["-A", "--all", "-u", "--update"].includes(token) || /^-[^-]*[Au]/u.test(token),
  );
  const explicit = args.some((token, index) => {
    const previous = index > 0 ? args[index - 1] : undefined;
    return !token.startsWith("-") && (previous === undefined || !["--chmod", "--intent-to-add"].includes(previous));
  });
  if (hasBulk && !explicit) {
    return finding(
      "deny", "Git Add Guard", "-A/--all/-u without a specific path stages changes in bulk", command,
      "stage each file explicitly with git add <specific-file-path>",
    );
  }
  return null;
}

function destructiveGit(invocation: GitInvocation, command: string): DeliveryFinding | null {
  const subcommand = invocation.subcommand;
  const args = invocation.args;
  if (subcommand === "update-ref" && args.includes("-d") && args.some((arg) => arg.startsWith("refs/original/"))) {
    return finding(
      "deny", "Dangerous Git Command", "deleting refs/original removes recovery references from history rewrites", command,
      "clean up recovery references only after a controlled history migration is verified",
    );
  }
  if (subcommand === "reset" && args.includes("--hard")) {
    return finding(
      "deny", "Dangerous Git Command", "git reset --hard discards uncommitted changes", command,
      "save the diff or stash first, then use a non-destructive reset",
    );
  }
  if (subcommand === "clean") {
    const dryRun = args.includes("-n") || args.includes("--dry-run") || args.some((arg) => /^-[^-]*n/u.test(arg));
    const destructive = args.some((arg) => ["--force", "--directory"].includes(arg) || /^-[^-]*[fd]/u.test(arg));
    if (destructive && !dryRun) {
      return finding(
        "deny", "Dangerous Git Command", "git clean -f/-d permanently deletes untracked files or directories", command,
        "run git clean -nd first and handle targets individually",
      );
    }
  }
  if (subcommand === "push") {
    const lease = args.some((arg) => arg === "--force-with-lease" || arg.startsWith("--force-with-lease="));
    const force = args.some((arg) => arg === "--force" || arg === "-f" || /^-[^-]*f/u.test(arg));
    if (force && !lease) {
      return finding(
        "deny", "Dangerous Git Command", "git push --force overwrites remote history", command,
        "use --force-with-lease and verify the remote baseline",
      );
    }
  }
  if (["filter-repo", "filter-branch"].includes(subcommand)) {
    return finding(
      "deny", "Dangerous Git Command", `${subcommand} rewrites repository history`, command,
      "run it in a separate clone and preserve recovery references",
    );
  }
  if (subcommand === "stash" && args[0] === "clear") {
    return finding(
      "deny", "Dangerous Git Command", "git stash clear permanently deletes every stash", command,
      "inspect stashes individually and delete only an explicitly authorized stash",
    );
  }
  if (subcommand === "stash" && args[0] === "drop") {
    const approved = /(?:^|[;&|]\s*)AI_EXPERTS_ALLOW_GIT_STASH_DROP=1\s+git(?:\s+-\S+)*\s+stash\s+drop\s+['"]?stash@\{\d+\}['"]?(?:\s|$)/u.test(command);
    const stashRef = args[1];
    if (!approved || args.length !== 2 || stashRef === undefined || !/^stash@\{\d+\}$/u.test(stashRef)) {
      return finding(
        "deny", "Dangerous Git Command", "git stash drop requires an inline approval sentinel and an explicit stash@{N}", command,
        "use AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{N}'",
      );
    }
  }
  if (subcommand === "checkout" && args.includes("--") && args.some((arg) => [".", "./", "*", "./*"].includes(arg))) {
    return finding(
      "deny", "Dangerous Git Command", "bulk checkout discards working-tree changes", command,
      "save the diff first and restore one file at a time",
    );
  }
  if (subcommand === "restore" && (
    args.some((arg) => [".", "./", "*", "./*"].includes(arg)) ||
    args.some((arg, index) => arg === "--source=HEAD" || (arg === "--source" && args[index + 1] === "HEAD"))
  )) {
    return finding(
      "deny", "Dangerous Git Command", "git restore overwrites working-tree changes from HEAD or a bulk target", command,
      "save the diff and restore only an explicitly authorized individual file and source",
    );
  }
  return null;
}

function branchName(invocation: GitInvocation, command: string): DeliveryFinding | null {
  if (!["checkout", "switch"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  const flagIndex = args.findIndex((arg) => ["-b", "-B", "-c", "-C", "--create", "--force-create"].includes(arg));
  const branch = flagIndex >= 0 ? args[flagIndex + 1] : null;
  if (!branch || BRANCH.test(branch)) return null;
  return finding(
    "deny", "Branch Naming Guard", `branch name ${branch} does not match <type>/<lowercase-slug>`, command,
    `use ${TYPES.join("|")}/<lowercase-slug>`,
  );
}

function worktreeAction(args: readonly string[]): string {
  for (const token of args) {
    if (token === "--") continue;
    if (token.startsWith("-")) continue;
    return token;
  }
  return "";
}

function worktreeCreate(invocation: GitInvocation, command: string): DeliveryFinding | null {
  if (invocation.subcommand !== "worktree") return null;
  if (worktreeAction(invocation.args) !== "add") return null;
  return finding(
    "deny",
    "Worktree Create Guard",
    "unsolicited git worktree add creates an extra linked checkout",
    command,
    "stay on the current checkout and use an ordinary short-lived branch; create a worktree only after the user asks for an isolated workspace or a declared process writes an allow receipt",
  );
}

function conflictChoice(invocation: GitInvocation, command: string): DeliveryFinding | null {
  if (!["checkout", "restore"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  if (!args.includes("--ours") && !args.includes("--theirs")) return null;
  const divider = args.indexOf("--");
  const candidates = divider >= 0
    ? args.slice(divider + 1)
    : args.filter((arg) => !arg.startsWith("-") && !["checkout", "restore"].includes(arg));
  const targets = candidates.filter((arg) => !["ours", "theirs"].includes(arg));
  const unsafe = targets.length !== 1 || targets.some((target) => {
    if ([".", "./", "*", "./*"].includes(target) || /[*?[]/u.test(target) || target.endsWith("/")) return true;
    try {
      return lstatSync(resolve(invocation.cwd, target)).isDirectory();
    } catch {
      return false;
    }
  });
  return unsafe
    ? finding(
        "deny", "Bulk Conflict Choice Guard", "ours/theirs may be applied only to one explicit file", command,
        "review each conflict and choose a side one file at a time",
      )
    : null;
}

function commitMessage(invocation: GitInvocation, command: string): DeliveryFinding | null {
  if (invocation.subcommand !== "commit") return null;
  const args = invocation.args;
  if (args.some((arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg))) return null;
  if (/\$\(\s*cat\s+<</u.test(command)) {
    return finding(
      "deny", "Commit Heredoc Guard", "commit messages must not be generated through heredoc command substitution", command,
      "use one or more git commit -m strings",
    );
  }
  const paragraphs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    const next = args[index + 1];
    if (["-m", "--message"].includes(token) && next) {
      index += 1;
      paragraphs.push(next);
    } else if (token.startsWith("--message=")) {
      paragraphs.push(token.slice(10));
    } else if (/^-m.+/u.test(token)) {
      paragraphs.push(token.slice(2));
    } else if (["-F", "--file"].includes(token) && next) {
      index += 1;
      const path = next;
      try { paragraphs.push(readFileSync(resolve(invocation.cwd, path), "utf8")); } catch {}
    } else if (token.startsWith("--file=")) {
      try { paragraphs.push(readFileSync(resolve(invocation.cwd, token.slice(7)), "utf8")); } catch {}
    } else if (/^-F.+/u.test(token)) {
      try { paragraphs.push(readFileSync(resolve(invocation.cwd, token.slice(2)), "utf8")); } catch {}
    }
  }
  const message = paragraphs.join("\n\n").trim();
  if (!message) return null;
  const first = message.split("\n").find((line) => line.trim())?.trim() ?? "";
  const description = (first.match(/^[^:]+:\s*(.+)$/u)?.[1] ?? first).trim();
  const issues = [];
  if (first.length < 8) issues.push("first line is too short");
  if (!COMMIT.test(first)) issues.push("not in Conventional Commits format");
  if (GENERIC.test(description)) issues.push("description is too vague");
  if (GARBLED.test(message)) issues.push("contains garbled text or control characters");
  return issues.length
    ? finding(
        "deny", "Commit Message Guard", issues.join("；"), command,
        "use <type>(<scope>): <specific-description>",
      )
    : null;
}

export function classifyDeliveryCommand(command: string, cwd: string): DeliveryFinding[] {
  const findings: DeliveryFinding[] = [];
  for (const invocation of gitInvocations(command, cwd)) {
    for (const result of [
      gitAdd(invocation, command), destructiveGit(invocation, command),
      branchName(invocation, command), conflictChoice(invocation, command),
      commitMessage(invocation, command), worktreeCreate(invocation, command),
    ]) {
      if (result) findings.push(result);
    }
  }
  return findings;
}

export function formatDeliveryFinding(value: DeliveryFinding): string {
  return [
    `[${value.id}] ${value.action === "deny" ? "Blocked" : "Risk notice"}`,
    "",
    `Reason: ${value.reason}`,
    `Recovery/alternative: ${value.recovery}`,
    ...(value.action === "deny" ? [
      "",
      "blockingContract:",
      "  observedFacts: The command or repository state matched a local Git delivery rule.",
      "  harm: The operation may lose changes, contaminate commit boundaries, hide conflicts, or impair recovery.",
      "  unblockWhen: Use an operation with explicit targets, recoverability, and clear commit boundaries.",
      `  recovery: ${value.recovery}`,
    ] : []),
  ].join("\n");
}

import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { shellCommandInvocations } from "../lib/shell-parse.mjs";

const TYPES = [
  "feat", "fix", "docs", "style", "refactor", "perf", "test", "build",
  "ci", "chore", "revert",
];
const BRANCH = new RegExp(`^(?:${TYPES.join("|")})/[a-z0-9][a-z0-9._\\-/]{1,79}$`, "u");
const COMMIT = new RegExp(`^(?:${TYPES.join("|")})(?:\\([^)]+\\))?!?:\\s.+`, "u");
const GENERIC = /^(?:fix|update|move|迁移|修复|优化|调整|兼容|补充|完善|修改|cleanup|clean up|refactor|misc|stuff)$/iu;
const GARBLED = /\uFFFD|[\x00-\x08\x0E-\x1F\x7F]|[\uE000-\uF8FF]|\u00C3[\u0080-\u00BF]/u;

function finding(action, id, reason, command, recovery) {
  return { action, id, reason, command, recovery };
}

export function gitInvocations(command, initialCwd) {
  if (typeof command !== "string" || !command.trim()) return [];
  return shellCommandInvocations(command).flatMap((invocation) => {
    if (invocation.executable !== "git" || invocation.stdinDriven) return [];
    const rawArgs = invocation.args;
    let cursor = 0;
    let cwd = resolve(initialCwd);
    while (cursor < rawArgs.length) {
      const token = rawArgs[cursor];
      if (token === "-C" && rawArgs[cursor + 1]) {
        cwd = resolve(cwd, rawArgs[cursor + 1]);
        cursor += 2;
        continue;
      }
      if (["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
        cursor += 2;
        continue;
      }
      if (/^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
        cursor += 1;
        continue;
      }
      break;
    }
    return [{ cwd, subcommand: rawArgs[cursor] ?? "", args: rawArgs.slice(cursor + 1) }];
  });
}

function gitAdd(invocation, command) {
  if (invocation.subcommand !== "add") return null;
  const args = invocation.args;
  if (args.some((token) => [".", "./", "*", "./*"].includes(token) || token.startsWith("--pathspec-from-file"))) {
    return finding(
      "deny", "Git Add Guard", "批量暂存可能混入其他任务的改动", command,
      "使用 git add <具体文件路径> 逐个暂存",
    );
  }
  const hasBulk = args.some((token) =>
    ["-A", "--all", "-u", "--update"].includes(token) || /^-[^-]*[Au]/u.test(token),
  );
  const explicit = args.some((token, index) =>
    !token.startsWith("-") && !["--chmod", "--intent-to-add"].includes(args[index - 1]),
  );
  if (hasBulk && !explicit) {
    return finding(
      "deny", "Git Add Guard", "未指定具体路径的 -A/--all/-u 会批量暂存", command,
      "使用 git add <具体文件路径> 逐个暂存",
    );
  }
  return null;
}

function destructiveGit(invocation, command) {
  const subcommand = invocation.subcommand;
  const args = invocation.args;
  if (subcommand === "update-ref" && args.includes("-d") && args.some((arg) => arg.startsWith("refs/original/"))) {
    return finding(
      "deny", "Dangerous Git Command", "删除 refs/original 会移除历史重写的恢复引用", command,
      "在受控历史迁移完成验证后再清理恢复引用",
    );
  }
  if (subcommand === "reset" && args.includes("--hard")) {
    return finding(
      "deny", "Dangerous Git Command", "git reset --hard 会丢失未提交改动", command,
      "先保存 diff 或 stash，再使用非破坏性 reset",
    );
  }
  if (subcommand === "clean") {
    const dryRun = args.includes("-n") || args.includes("--dry-run") || args.some((arg) => /^-[^-]*n/u.test(arg));
    const destructive = args.some((arg) => ["--force", "--directory"].includes(arg) || /^-[^-]*[fd]/u.test(arg));
    if (destructive && !dryRun) {
      return finding(
        "deny", "Dangerous Git Command", "git clean -f/-d 会永久删除未跟踪文件或目录", command,
        "先运行 git clean -nd 并逐个处理",
      );
    }
  }
  if (subcommand === "push") {
    const lease = args.some((arg) => arg === "--force-with-lease" || arg.startsWith("--force-with-lease="));
    const force = args.some((arg) => arg === "--force" || arg === "-f" || /^-[^-]*f/u.test(arg));
    if (force && !lease) {
      return finding(
        "deny", "Dangerous Git Command", "git push --force 会覆盖远程历史", command,
        "改用 --force-with-lease 并核对远端基线",
      );
    }
  }
  if (["filter-repo", "filter-branch"].includes(subcommand)) {
    return finding(
      "deny", "Dangerous Git Command", `${subcommand} 会改写仓库历史`, command,
      "在独立克隆中执行并保留恢复引用",
    );
  }
  if (subcommand === "stash" && args[0] === "clear") {
    return finding(
      "deny", "Dangerous Git Command", "git stash clear 会永久删除全部 stash", command,
      "逐个检查并仅删除明确授权的 stash",
    );
  }
  if (subcommand === "stash" && args[0] === "drop") {
    const approved = /(?:^|[;&|]\s*)AI_EXPERTS_ALLOW_GIT_STASH_DROP=1\s+git(?:\s+-\S+)*\s+stash\s+drop\s+['"]?stash@\{\d+\}['"]?(?:\s|$)/u.test(command);
    if (!approved || args.length !== 2 || !/^stash@\{\d+\}$/u.test(args[1])) {
      return finding(
        "deny", "Dangerous Git Command", "git stash drop 需要 inline approval sentinel 和一个显式 stash@{N}", command,
        "使用 AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{N}'",
      );
    }
  }
  if (subcommand === "checkout" && args.includes("--") && args.some((arg) => [".", "./", "*", "./*"].includes(arg))) {
    return finding(
      "deny", "Dangerous Git Command", "批量 checkout 会丢弃工作区改动", command,
      "逐个文件恢复并先保存 diff",
    );
  }
  if (subcommand === "restore" && (
    args.some((arg) => [".", "./", "*", "./*"].includes(arg)) ||
    args.some((arg, index) => arg === "--source=HEAD" || (arg === "--source" && args[index + 1] === "HEAD"))
  )) {
    return finding(
      "deny", "Dangerous Git Command", "git restore 会用 HEAD 或批量目标覆盖工作区改动", command,
      "先保存 diff，并只恢复明确授权的单个文件和来源",
    );
  }
  return null;
}

function branchName(invocation, command) {
  if (!["checkout", "switch"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  const flagIndex = args.findIndex((arg) => ["-b", "-B", "-c", "-C", "--create", "--force-create"].includes(arg));
  const branch = flagIndex >= 0 ? args[flagIndex + 1] : null;
  if (!branch || BRANCH.test(branch)) return null;
  return finding(
    "deny", "Branch Naming Guard", `分支名 ${branch} 不符合 <type>/<lowercase-slug>`, command,
    `使用 ${TYPES.join("|")}/<lowercase-slug>`,
  );
}

function conflictChoice(invocation, command) {
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
        "deny", "Bulk Conflict Choice Guard", "ours/theirs 只能用于一个显式文件", command,
        "逐个文件审查冲突后选择一侧",
      )
    : null;
}

function commitMessage(invocation, command) {
  if (invocation.subcommand !== "commit") return null;
  const args = invocation.args;
  if (args.some((arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg))) return null;
  if (/\$\(\s*cat\s+<</u.test(command)) {
    return finding(
      "deny", "Commit Heredoc Guard", "提交信息不能通过 heredoc 命令替换生成", command,
      "使用一个或多个 git commit -m 字符串",
    );
  }
  const paragraphs = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (["-m", "--message"].includes(token) && args[index + 1]) {
      paragraphs.push(args[index += 1]);
    } else if (token.startsWith("--message=")) {
      paragraphs.push(token.slice(10));
    } else if (/^-m.+/u.test(token)) {
      paragraphs.push(token.slice(2));
    } else if (["-F", "--file"].includes(token) && args[index + 1]) {
      const path = args[index += 1];
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
  if (first.length < 8) issues.push("首行过短");
  if (!COMMIT.test(first)) issues.push("不是 Conventional Commits 格式");
  if (GENERIC.test(description)) issues.push("描述过于模糊");
  if (GARBLED.test(message)) issues.push("包含乱码或控制字符");
  return issues.length
    ? finding(
        "deny", "Commit Message Guard", issues.join("；"), command,
        "使用 <type>(<scope>): <具体说明>",
      )
    : null;
}

export function classifyDeliveryCommand(command, cwd) {
  const findings = [];
  for (const invocation of gitInvocations(command, cwd)) {
    for (const result of [
      gitAdd(invocation, command), destructiveGit(invocation, command),
      branchName(invocation, command), conflictChoice(invocation, command),
      commitMessage(invocation, command),
    ]) {
      if (result) findings.push(result);
    }
  }
  return findings;
}

export function formatDeliveryFinding(value) {
  return [
    `[${value.id}] ${value.action === "deny" ? "已拦截" : "风险提示"}`,
    "",
    `原因：${value.reason}`,
    `恢复/替代：${value.recovery}`,
    ...(value.action === "deny" ? [
      "",
      "blockingContract:",
      "  observedFacts: 命令或仓库状态命中了本地 Git 交付规则。",
      "  harm: 可能丢失改动、污染提交边界、掩盖冲突或破坏恢复能力。",
      "  unblockWhen: 改为目标明确、可恢复且提交边界清晰的操作。",
      `  recovery: ${value.recovery}`,
    ] : []),
  ].join("\n");
}

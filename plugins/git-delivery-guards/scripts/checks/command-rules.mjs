import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { splitShellLogicalLines, tokenizeShell } from "../lib/shell-parse.mjs";

const TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
const BRANCH = new RegExp(`^(?:${TYPES.join("|")})/[a-z0-9][a-z0-9._\\-/]{1,79}$`, "u");
const COMMIT = new RegExp(`^(?:${TYPES.join("|")})(?:\\([^)]+\\))?!?:\\s.+`, "u");
const GENERIC = /^(?:fix|update|move|迁移|修复|优化|调整|兼容|补充|完善|修改|cleanup|clean up|refactor|misc|stuff)$/iu;
const GARBLED = /\uFFFD|[\x00-\x08\x0E-\x1F\x7F]|[\uE000-\uF8FF]|\u00C3[\u0080-\u00BF]/u;

function segments(command) {
  return splitShellLogicalLines(command).flatMap((line) => {
    const result = []; let current = [];
    for (const token of tokenizeShell(line)) { if ([";", "&&", "||", "|", "&"].includes(token)) { if (current.length) result.push(current); current = []; } else current.push(token); }
    if (current.length) result.push(current); return result;
  });
}

function invocations(command, executable, subcommands = []) {
  const matches = [];
  for (const segment of segments(command)) {
    const index = segment.findIndex((token) => token.split("/").at(-1) === executable);
    if (index < 0) continue;
    const args = segment.slice(index + 1);
    if (!subcommands.length || subcommands.includes(args[0])) matches.push(args);
  }
  return matches;
}

function stripGitGlobals(args) {
  let index = 0;
  const withValue = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"]);
  while (index < args.length) {
    const token = args[index];
    if (withValue.has(token)) { index += 2; continue; }
    if (/^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) { index += 1; continue; }
    break;
  }
  return args.slice(index);
}

function result(action, id, reason, command, recovery) { return { action, id, reason, command, recovery }; }

function gitAdd(args, command) {
  if (args[0] !== "add") return null; const rest = args.slice(1);
  if (rest.some((token) => [".", "./", "*", "./*"].includes(token) || token.startsWith("--pathspec-from-file"))) return result("deny", "Git Add Guard", "批量暂存可能混入其他任务的改动", command, "使用 git add <具体文件路径> 逐个暂存");
  const hasBulk = rest.some((token) => ["-A", "--all", "-u", "--update"].includes(token) || /^-[^-]*[Au]/u.test(token));
  const explicit = rest.some((token, index) => !token.startsWith("-") && !["--chmod"].includes(rest[index - 1]));
  if (hasBulk && !explicit) return result("deny", "Git Add Guard", "未指定具体路径的 -A/--all/-u 会批量暂存", command, "使用 git add <具体文件路径> 逐个暂存");
  return null;
}

function destructiveGit(args, command) {
  const sub = args[0], rest = args.slice(1);
  if (sub === "reset" && rest.includes("--hard")) return result("deny", "Dangerous Git Command", "git reset --hard 会丢失未提交改动", command, "先保存 diff 或 stash，再使用非破坏性 reset");
  if (sub === "clean" && rest.some((arg) => /^-[a-z]*f/iu.test(arg))) return result("deny", "Dangerous Git Command", "git clean -f 会永久删除未跟踪文件", command, "先运行 git clean -nd 并逐个处理");
  if (sub === "push" && (rest.includes("--force") || rest.includes("-f")) && !rest.includes("--force-with-lease")) return result("deny", "Dangerous Git Command", "git push --force 会覆盖远程历史", command, "改用 --force-with-lease 并核对远端基线");
  if (["filter-repo", "filter-branch"].includes(sub)) return result("deny", "Dangerous Git Command", `${sub} 会改写仓库历史`, command, "在独立克隆中执行并保留恢复引用");
  if (sub === "stash" && rest[0] === "clear") return result("deny", "Dangerous Git Command", "git stash clear 会永久删除所有 stash", command, "逐个检查并仅删除明确授权的 stash");
  if (sub === "stash" && rest[0] === "drop" && !process.env.AI_EXPERTS_ALLOW_STASH_DROP) return result("deny", "Dangerous Git Command", "git stash drop 会永久删除 stash", command, "设置明确授权哨兵后仅删除显式 stash@{N}");
  if (sub === "checkout" && rest.includes("--") && rest.some((arg) => [".", "./", "*", "./*"].includes(arg))) return result("deny", "Dangerous Git Command", "批量 checkout 会丢弃工作区改动", command, "逐个文件恢复并先保存 diff");
  if (sub === "restore" && rest.some((arg) => [".", "./", "*", "./*"].includes(arg))) return result("deny", "Dangerous Git Command", "批量 restore 会丢弃工作区改动", command, "逐个文件恢复并先保存 diff");
  return null;
}

function branchName(args, command) {
  if (!["checkout", "switch"].includes(args[0])) return null; const rest = args.slice(1); const flag = rest[0];
  if (!["-b", "-B", "-c", "-C", "--create", "--force-create"].includes(flag) || !rest[1] || BRANCH.test(rest[1])) return null;
  return result("deny", "Branch Naming", `分支名 ${rest[1]} 不符合 <type>/<slug>`, command, `使用 ${TYPES.join("|")}/<lowercase-slug>`);
}

function conflictChoice(args, command, cwd) {
  if (!["checkout", "restore"].includes(args[0]) || (!args.includes("--ours") && !args.includes("--theirs"))) return null;
  const divider = args.indexOf("--"); const targets = divider >= 0 ? args.slice(divider + 1) : args.slice(1).filter((arg) => !arg.startsWith("-"));
  const bulk = targets.length !== 1 || targets.some((target) => [".", "./", "*", "./*"].includes(target) || /[*?[]/u.test(target) || target.endsWith("/") || (() => { try { return lstatSync(resolve(cwd, target)).isDirectory(); } catch { return false; } })());
  return bulk ? result("deny", "Bulk Conflict Choice", "ours/theirs 只能用于单一显式文件", command, "逐个文件审查冲突后选择一侧") : null;
}

function commitMessage(args, command) {
  if (args[0] !== "commit" || args.includes("--amend") || args.includes("--fixup") || args.includes("--squash")) return null;
  if (/\$\(\s*cat\s+<</u.test(command)) return result("deny", "Commit Heredoc Guard", "提交信息不能通过 heredoc 命令替换生成", command, "使用一个或多个 git commit -m 字符串");
  let message = ""; for (let i = 1; i < args.length; i += 1) { if (["-m", "--message"].includes(args[i]) && args[i + 1]) { message = args[i + 1]; break; } if (args[i].startsWith("--message=")) { message = args[i].slice(10); break; } if (/^-m.+/u.test(args[i])) { message = args[i].slice(2); break; } }
  if (!message) return null; const first = message.split("\n").find((line) => line.trim())?.trim() ?? ""; const description = (first.match(/^[^:]+:\s*(.+)$/u)?.[1] ?? first).trim(); const issues = [];
  if (first.length < 8) issues.push("首行过短"); if (!COMMIT.test(first)) issues.push("不是 Conventional Commits 格式"); if (GENERIC.test(description)) issues.push("描述过于模糊"); if (GARBLED.test(message)) issues.push("包含乱码或控制字符");
  return issues.length ? result("deny", "Commit Message", issues.join("；"), command, "使用 <type>(<scope>): <具体说明>") : null;
}

function ghMutation(args, command) {
  const pair = `${args[0] ?? ""} ${args[1] ?? ""}`; const mutations = new Set(["run rerun", "run cancel", "run delete", "workflow run", "workflow enable", "workflow disable", "pr merge", "pr close"]);
  const api = args[0] === "api" && args.some((arg, index) => ["POST", "PUT", "PATCH", "DELETE"].includes((arg.startsWith("--method=") ? arg.slice(9) : ["--method", "-X"].includes(args[index - 1]) ? arg : "").toUpperCase()));
  return mutations.has(pair) || api ? result("report", "GitHub State Change Audit", `检测到 gh 状态变更：${api ? "api mutation" : pair}`, "", "确认目标、影响范围、权限与恢复路径") : null;
}

function glabMutation(args, command, reviewScope) {
  const pair = `${args[0] ?? ""} ${args[1] ?? ""}`; const pairs = /^(?:issue (?:create|update|close|reopen|delete)|mr (?:create|update|merge|close|reopen|approve|revoke|delete)|ci (?:retry|cancel|run)|pipeline (?:retry|cancel|delete)|release (?:create|update|delete))$/u;
  const api = args[0] === "api" && args.some((arg, index) => ["POST", "PUT", "PATCH", "DELETE"].includes((arg.startsWith("--method=") ? arg.slice(9) : ["--method", "-X"].includes(args[index - 1]) ? arg : "").toUpperCase()));
  if (!pairs.test(pair) && !api) return null; return result(reviewScope ? "deny" : "report", "GitLab Review Mutation Guard", `检测到 glab 状态变更：${api ? "api mutation" : pair}`, "", reviewScope ? "使用参数化 GitLab MCP Tool 写回" : "确认目标和恢复路径；评审工作流内必须使用 GitLab MCP Tool");
}

function svnRules(args, command) {
  const sub = args[0] === "ci" ? "commit" : args[0], rest = args.slice(1);
  if (sub === "add" && rest.some((arg) => [".", "./", "*", "./*", "--force"].includes(arg) || arg.startsWith("--targets"))) return result("deny", "SVN Add Guard", "批量 svn add 容易混入无关文件", command, "逐个指定文件路径");
  if (sub !== "commit") return null; const paths = rest.filter((arg, index) => !arg.startsWith("-") && !["-m", "--message", "-F", "--file"].includes(rest[index - 1])); if (!paths.length || rest.some((arg) => arg.startsWith("--targets"))) return result("deny", "SVN Commit Scope", "svn commit 必须指定具体路径", command, "显式列出本次提交文件");
  let message = ""; for (let i = 0; i < rest.length; i += 1) { if (["-m", "--message"].includes(rest[i]) && rest[i + 1]) message = rest[i + 1]; else if (rest[i].startsWith("--message=")) message = rest[i].slice(10); }
  if (message) { const first = message.split("\n")[0].trim(); if (first.length < 8 || GENERIC.test(first) || GARBLED.test(message)) return result("deny", "SVN Commit Message", "提交信息过短、模糊或包含乱码", command, "说明具体改动、范围和原因"); }
  return null;
}

export function classifyDeliveryCommand(command, cwd, event = {}) {
  if (typeof command !== "string" || !command.trim()) return [];
  const findings = [];
  for (const rawArgs of invocations(command, "git")) { const args = stripGitGlobals(rawArgs); for (const check of [gitAdd(args, command), destructiveGit(args, command), branchName(args, command), conflictChoice(args, command, cwd), commitMessage(args, command)]) if (check) findings.push(check); }
  for (const args of invocations(command, "gh")) { const finding = ghMutation(args, command); if (finding) findings.push(finding); }
  const reviewScope = /all-in-one-review|agentic-fix-review-gate/u.test(JSON.stringify(event)); for (const args of invocations(command, "glab")) { const finding = glabMutation(args, command, reviewScope); if (finding) findings.push(finding); }
  for (const args of invocations(command, "svn")) { const finding = svnRules(args, command); if (finding) findings.push(finding); }
  return findings;
}

export function formatDeliveryFinding(finding) { return [`[${finding.id}] ${finding.action === "deny" ? "已拦截" : "风险提示"}`, "", `原因：${finding.reason}`, ...(finding.command ? [`命令：${finding.command}`] : []), `恢复/替代：${finding.recovery}`, ...(finding.action === "deny" ? ["", "blockingContract:", "  observedFacts: 命令匹配高风险 Git/SVN/交付变更规则。", "  harm: 可能丢失改动、污染提交边界或绕过受控写回。", "  unblockWhen: 改为目标明确、可恢复且边界清晰的操作。", `  recovery: ${finding.recovery}`] : [])].join("\n"); }

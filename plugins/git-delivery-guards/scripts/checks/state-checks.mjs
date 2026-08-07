import { execFileSync } from "node:child_process";
import {
  existsSync, lstatSync, readFileSync, unlinkSync,
} from "node:fs";
import { basename, extname, join, posix, resolve } from "node:path";

import { gitInvocations } from "./command-rules.mjs";

const WRITE_COMMANDS = new Set([
  "add", "am", "checkout", "cherry-pick", "commit", "merge", "mv", "pull",
  "rebase", "reset", "restore", "rm", "stash", "switch",
]);
const LOCK_AGE_MS = 5 * 60 * 1000;
const MANIFESTS = [
  "package.json", "composer.json", "go.mod", "Cargo.toml", "pyproject.toml",
  "pom.xml", "build.gradle", "build.gradle.kts", "mix.exs", "Gemfile",
  "CMakeLists.txt",
];
const SOURCE_EXTENSIONS = new Set([
  ".c", ".cpp", ".cs", ".ex", ".go", ".h", ".hpp", ".java", ".js",
  ".jsx", ".kt", ".kts", ".mjs", ".php", ".py", ".rb", ".rs", ".scala",
  ".sh", ".svelte", ".swift", ".ts", ".tsx", ".vue",
]);
const CONFIG_EXTENSIONS = new Set([
  ".cfg", ".conf", ".env", ".hcl", ".ini", ".json", ".properties", ".tf",
  ".tfvars", ".toml", ".xml", ".yaml", ".yml",
]);

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

function lines(args, cwd) {
  const output = git(args, cwd);
  return output === null ? null : output ? output.split("\n").filter(Boolean) : [];
}

function finding(action, id, reason, recovery) {
  return { action, id, reason, recovery };
}

function processState(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (error?.code === "ESRCH") return "dead";
    return "unknown";
  }
}

function staleLock(invocation) {
  if (!WRITE_COMMANDS.has(invocation.subcommand)) return null;
  const rawGitDir = git(["rev-parse", "--git-dir"], invocation.cwd);
  if (!rawGitDir) return null;
  const lockPath = resolve(invocation.cwd, rawGitDir, "index.lock");
  if (!existsSync(lockPath)) return null;

  let snapshot;
  try {
    snapshot = lstatSync(lockPath);
  } catch {
    return null;
  }
  if (!snapshot.isFile() || snapshot.isSymbolicLink()) {
    return finding(
      "deny", "Git Lock Guard", `${lockPath} 不是可安全处理的普通锁文件`,
      "停止 Git 写操作，人工核对 Git 目录与锁文件类型",
    );
  }

  const age = Date.now() - snapshot.mtimeMs;
  if (age < LOCK_AGE_MS) {
    return finding(
      "deny", "Git Lock Guard", `index.lock 仅存在 ${Math.max(0, Math.round(age / 1000))} 秒，尚未超过安全阈值`,
      "等待当前 Git 操作完成后重试",
    );
  }

  let pid = null;
  try {
    pid = Number(readFileSync(lockPath, "utf8").slice(0, 64).match(/^(\d+)\s/u)?.[1]);
  } catch {}
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return finding(
      "deny", "Git Lock Guard", "陈旧 index.lock 没有可验证的持有者 PID，拒绝自动删除",
      `确认没有 Git 进程后人工删除 ${lockPath}`,
    );
  }

  const holder = processState(pid);
  if (holder !== "dead") {
    return finding(
      "deny", "Git Lock Guard",
      holder === "alive" ? `index.lock 记录的 PID ${pid} 仍存活` : `无法确认 PID ${pid} 已退出`,
      "等待持有者完成；仅在确认进程退出后处理锁文件",
    );
  }

  try {
    const current = lstatSync(lockPath);
    const sameFile = current.isFile() && !current.isSymbolicLink() &&
      current.dev === snapshot.dev && current.ino === snapshot.ino &&
      current.mtimeMs === snapshot.mtimeMs;
    if (!sameFile) {
      return finding(
        "deny", "Git Lock Guard", "index.lock 在验证期间发生变化，拒绝自动删除",
        "重新检查当前 Git 持有者和锁文件状态",
      );
    }
    unlinkSync(lockPath);
    return finding(
      "report", "Git Lock Guard", `已清理存在 ${Math.round(age / 1000)} 秒且 PID ${pid} 已退出的 index.lock`,
      "无需操作；若 Git 仍失败，重新检查是否出现新的锁持有者",
    );
  } catch (error) {
    return finding(
      "deny", "Git Lock Guard", `陈旧 index.lock 无法安全清理：${error?.message ?? error}`,
      `确认没有 Git 进程后人工删除 ${lockPath}`,
    );
  }
}

function readBoundaryRules(root) {
  const configPath = join(root, ".ai-experts", "commit-boundaries.json");
  if (!existsSync(configPath)) return { rules: [], error: null };
  let value;
  try {
    value = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    return { rules: [], error: `无法解析 ${configPath}: ${error?.message ?? error}` };
  }
  if (value?.version !== 1 || !Array.isArray(value.boundaries)) {
    return { rules: [], error: `${configPath} 必须包含 version: 1 和 boundaries 数组` };
  }
  const rules = [];
  const ids = new Set();
  for (const [index, item] of value.boundaries.entries()) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || !Array.isArray(item.prefixes) || item.prefixes.length === 0) {
      return { rules: [], error: `boundaries[${index}] 必须有唯一非空 id 和非空 prefixes 数组` };
    }
    ids.add(item.id);
    for (const prefixValue of item.prefixes) {
      if (typeof prefixValue !== "string" || !prefixValue.trim()) {
        return { rules: [], error: `boundaries[${index}].prefixes 只能包含非空字符串` };
      }
      const segments = prefixValue.replaceAll("\\", "/").split("/");
      if (segments.includes("..")) {
        return { rules: [], error: `boundaries[${index}] 的 prefix 不能包含 ..` };
      }
      const prefix = prefixValue.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
      rules.push({ id: item.id, prefix });
    }
  }
  rules.sort((left, right) => right.prefix.length - left.prefix.length);
  return { rules, error: null };
}

function boundaryFor(file, root, rules) {
  const normalized = file.replaceAll("\\", "/");
  const explicit = rules.find((rule) =>
    !rule.prefix || normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`),
  );
  if (explicit) return explicit.id;
  let directory = posix.dirname(normalized);
  while (true) {
    const diskPath = directory === "." ? root : join(root, directory);
    if (MANIFESTS.some((name) => existsSync(join(diskPath, name)))) {
      return directory === "." ? "repo-root" : directory;
    }
    if (directory === ".") return "repo-root";
    const parent = posix.dirname(directory);
    if (parent === directory) return "repo-root";
    directory = parent;
  }
}

function commitState(invocation) {
  if (invocation.subcommand !== "commit" || invocation.args.some((arg) =>
    /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg),
  )) return [];

  const staged = lines(["diff", "--cached", "--name-only"], invocation.cwd);
  if (!staged) return [];
  const unstaged = lines(["diff", "--name-only"], invocation.cwd);
  const unstagedSet = new Set(unstaged ?? []);
  const overlap = staged.filter((file) => unstagedSet.has(file));
  const findings = [];
  const commitAll = invocation.args.some((arg) => arg === "-a" || arg === "--all" || /^-[^-]*a/u.test(arg));
  if (overlap.length && !commitAll) {
    findings.push(finding(
      "report", "Partial Staging Guard",
      `${overlap.length} 个文件同时有 staged 与 unstaged 改动：${overlap.slice(0, 8).join(", ")}`,
      "分别检查 git diff --cached -- <file> 与 git diff -- <file>",
    ));
  }
  const files = commitAll ? [...new Set([...staged, ...(unstaged ?? [])])] : staged;
  if (!files.length) return findings;

  const root = git(["rev-parse", "--show-toplevel"], invocation.cwd) || invocation.cwd;
  const boundaryConfig = readBoundaryRules(root);
  if (boundaryConfig.error) {
    findings.push(finding(
      "deny", "Commit Scope Guard", boundaryConfig.error,
      "修复 .ai-experts/commit-boundaries.json 后重新提交",
    ));
    return findings;
  }

  const nameStatus = lines(["diff", "--cached", "--name-status"], invocation.cwd);
  if (nameStatus?.length && nameStatus.every((line) => /^R\d*\t/u.test(line))) {
    if (files.length > 15) {
      findings.push(finding(
        "report", "Commit Scope Guard", `纯 rename 提交包含 ${files.length} 项迁移`,
        "确认迁移映射已逐项对账",
      ));
    }
    return findings;
  }

  const groups = new Map();
  for (const file of files) {
    const boundary = boundaryFor(file, root, boundaryConfig.rules);
    if (!groups.has(boundary)) groups.set(boundary, { source: false, config: false });
    const group = groups.get(boundary);
    const extension = extname(file).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension)) group.source = true;
    if (CONFIG_EXTENSIONS.has(extension) || /^(?:Dockerfile|Jenkinsfile|Makefile)$/u.test(basename(file))) group.config = true;
  }
  const mixed = [...groups.values()].some((group) => group.source && group.config);
  if (groups.size >= 2 || mixed) {
    findings.push(finding(
      "deny", "Commit Scope Guard",
      `提交跨 ${groups.size} 个 manifest/explicit 边界，或混合 source 与 config/infra：${[...groups.keys()].join(", ")}`,
      "取消批量暂存，按声明边界和关注点逐组 git add/commit",
    ));
  } else if (files.length > 15) {
    findings.push(finding(
      "report", "Commit Scope Guard", `单次提交包含 ${files.length} 个文件`,
      "确认是否能继续拆分为更小的原子提交",
    ));
  }
  return findings;
}

export function deliveryStateFindings(cwd, command) {
  return gitInvocations(command, cwd).flatMap((invocation) => [
    staleLock(invocation), ...commitState(invocation),
  ].filter(Boolean));
}

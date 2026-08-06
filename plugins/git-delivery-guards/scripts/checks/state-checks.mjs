import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join, posix, resolve } from "node:path";
import { tokenizeShell } from "../lib/shell-parse.mjs";

function git(args, cwd) { try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).trim(); } catch { return null; } }
function lines(args, cwd) { const output = git(args, cwd); return output === null ? null : output ? output.split("\n").filter(Boolean) : []; }
function finding(action, id, reason, recovery) { return { action, id, reason, recovery }; }

function gitInvocation(command, initialCwd) {
  const tokens = tokenizeShell(command); const index = tokens.findIndex((token) => token.split("/").at(-1) === "git"); if (index < 0) return null;
  const args = tokens.slice(index + 1); let cursor = 0, cwd = initialCwd;
  while (cursor < args.length) {
    const token = args[cursor];
    if (token === "-C" && args[cursor + 1]) { cwd = resolve(cwd, args[cursor + 1]); cursor += 2; continue; }
    if (["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) { cursor += 2; continue; }
    if (/^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) { cursor += 1; continue; }
    break;
  }
  return { cwd, subcommand: args[cursor] ?? "", args: args.slice(cursor + 1) };
}

function staleLock(cwd, command) {
  const invocation = gitInvocation(command, cwd); if (!invocation || !["add", "commit", "merge", "rebase", "cherry-pick", "checkout", "switch", "restore", "reset", "stash", "am", "pull", "rm", "mv"].includes(invocation.subcommand)) return null; cwd = invocation.cwd;
  const raw = git(["rev-parse", "--git-dir"], cwd); if (!raw) return null; const gitDir = resolve(cwd, raw), lock = join(gitDir, "index.lock"); if (!existsSync(lock)) return null;
  let age; try { age = Date.now() - statSync(lock).mtimeMs; } catch { return null; }
  let pid = null; try { pid = Number(readFileSync(lock, "utf8").slice(0, 64).match(/^(\d+)\s/u)?.[1]); } catch {}
  let alive = false; if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); alive = true; } catch (error) { alive = error?.code === "EPERM"; } }
  if (!alive && age >= 5 * 60 * 1000) { try { unlinkSync(lock); return finding("report", "Git Lock", `已清理存在 ${Math.round(age / 1000)} 秒且无存活持有者的 stale index.lock`, "无需操作；若 Git 仍失败，检查是否有新锁持有者"); } catch (error) { return finding("deny", "Git Lock", `stale index.lock 无法清理：${error?.message ?? error}`, `确认没有 Git 进程后手动删除 ${lock}`); } }
  return finding("deny", "Git Lock", `index.lock 正在使用或尚未超过安全阈值（${Math.round(age / 1000)} 秒）`, "等待当前 Git 操作完成；确认持有者退出后再清理");
}

const MANIFESTS = ["package.json", "composer.json", "go.mod", "Cargo.toml", "pyproject.toml", "pom.xml", "build.gradle", "build.gradle.kts", "mix.exs", "Gemfile", "CMakeLists.txt"];
const SOURCE = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".php", ".go", ".rs", ".py", ".java", ".kt", ".kts", ".rb", ".ex", ".cpp", ".c", ".h", ".hpp", ".swift", ".cs", ".scala", ".sh", ".vue", ".svelte"]);
const CONFIG = new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".tf", ".tfvars", ".hcl", ".xml", ".env", ".properties"]);

function boundaryRules(root) { try { const value = JSON.parse(readFileSync(join(root, ".ai-experts", "commit-boundaries.json"), "utf8")); if (!Array.isArray(value?.boundaries)) return []; return value.boundaries.flatMap((item) => typeof item?.id === "string" && Array.isArray(item.prefixes) ? item.prefixes.filter((prefix) => typeof prefix === "string" && !prefix.split(/[\\/]/u).includes("..")).map((prefix) => ({ id: item.id, prefix: prefix.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "") })) : []).sort((a, b) => b.prefix.length - a.prefix.length); } catch { return []; } }

function boundary(file, root, rules) {
  const normalized = file.replaceAll("\\", "/");
  const explicit = rules.find((rule) => !rule.prefix || normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`));
  if (explicit) return explicit.id;
  let dir = posix.dirname(normalized);
  while (true) { const disk = dir === "." ? root : join(root, dir); if (MANIFESTS.some((name) => existsSync(join(disk, name)))) return dir === "." ? "repo-root" : dir; if (dir === ".") return "repo-root"; const parent = posix.dirname(dir); if (parent === dir) return "repo-root"; dir = parent; }
}

function commitState(cwd, command) {
  const invocation = gitInvocation(command, cwd); if (!invocation || invocation.subcommand !== "commit" || invocation.args.some((arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg))) return []; cwd = invocation.cwd;
  const staged = lines(["diff", "--cached", "--name-only"], cwd), unstaged = lines(["diff", "--name-only"], cwd); if (!staged) return [];
  const findings = []; const overlap = unstaged ? staged.filter((file) => new Set(unstaged).has(file)) : [];
  if (overlap.length && !invocation.args.some((arg) => arg === "-a" || arg === "--all" || /^-[^-]*a/u.test(arg))) findings.push(finding("report", "Partial Staging", `${overlap.length} 个文件同时有 staged 与 unstaged 改动：${overlap.slice(0, 8).join(", ")}`, "分别检查 git diff --cached -- <file> 与 git diff -- <file>"));
  const files = invocation.args.some((arg) => arg === "-a" || arg === "--all" || /^-[^-]*a/u.test(arg)) ? [...new Set([...staged, ...(unstaged ?? [])])] : staged;
  if (!files.length) return findings; const root = git(["rev-parse", "--show-toplevel"], cwd) || cwd; const nameStatus = lines(["diff", "--cached", "--name-status"], cwd); if (nameStatus?.length && nameStatus.every((line) => /^R\d*\t/u.test(line))) { if (files.length > 15) findings.push(finding("report", "Commit Scope", `纯 rename 提交包含 ${files.length} 项迁移`, "确认迁移映射已对账")); return findings; } const rules = boundaryRules(root), groups = new Map();
  for (const file of files) { const id = boundary(file, root, rules); if (!groups.has(id)) groups.set(id, { source: false, config: false, files: [] }); const group = groups.get(id); group.files.push(file); const extension = extname(file).toLowerCase(); if (SOURCE.has(extension)) group.source = true; if (CONFIG.has(extension) || /^(?:Dockerfile|Makefile|Jenkinsfile)$/u.test(basename(file))) group.config = true; }
  const mixed = [...groups.entries()].filter(([, group]) => group.source && group.config); if (groups.size >= 2 || mixed.length) findings.push(finding("deny", "Commit Scope", `提交跨 ${groups.size} 个 manifest/explicit 边界，或混合 source 与 config/infra：${[...groups.keys()].join(", ")}`, "取消批量暂存，按声明边界和关注点逐组 git add/commit")); else if (files.length > 15) findings.push(finding("report", "Commit Scope", `单次提交包含 ${files.length} 个文件`, "确认是否能继续拆分为更小的原子提交"));
  return findings;
}

export function deliveryStateFindings(cwd, command) { return [staleLock(cwd, command), ...commitState(cwd, command)].filter(Boolean); }

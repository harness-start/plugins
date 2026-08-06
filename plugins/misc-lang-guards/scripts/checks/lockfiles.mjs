import { basename } from "node:path";

const LOCKFILES = new Map([
  ["packages.lock.json", "dotnet restore"],
  ["mix.lock", "mix deps.get"],
  ["flake.lock", "nix flake lock"],
  ["renv.lock", "renv::snapshot()"],
  ["gemfile.lock", "bundle install"],
]);

function clean(value) { return String(value ?? "").replaceAll("\\", "/").replace(/\/+$/u, ""); }
export function isMiscLockfile(value) { return LOCKFILES.has(basename(clean(value)).toLowerCase()); }

function patchPaths(blob) {
  return typeof blob === "string" ? [...blob.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)].map((match) => match[1].trim()) : [];
}

function shellTargets(command) {
  if (typeof command !== "string") return [];
  const targets = [...command.matchAll(/(?:>|>>)\s*([^\s;&|'"`]+)/gu)].map((match) => match[1]);
  for (const segment of command.split(/&&|\|\||[;|\n]/u)) {
    if (!/\btee\b/iu.test(segment)) continue;
    targets.push(...(segment.match(/"[^"]*"|'[^']*'|\S+/gu) ?? []).slice(1).map((token) => token.replace(/^(['"])(.*)\1$/u, "$2")));
  }
  return targets;
}

export function collectMiscLockfiles(toolName, input = {}) {
  const normalized = String(toolName ?? "").toLowerCase();
  const command = input.command ?? input.cmd ?? "";
  const candidates = [input.file_path, input.filePath, input.path, input.target_file];
  if (/apply_?patch|applypatch/iu.test(normalized)) candidates.push(...patchPaths([input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n")));
  if (/bash|shell|exec|local_shell/iu.test(normalized)) candidates.push(...shellTargets(command));
  const targets = [...new Set(candidates.filter(isMiscLockfile))];
  const bypass = /\bbundle\s+install\b[^\n]*--without-lock\b/iu.test(command);
  return { targets, bypass };
}

export function miscLockfileDeny({ targets, bypass }) {
  const generators = [...new Set(targets.map((target) => LOCKFILES.get(basename(clean(target)).toLowerCase())))];
  return [
    "[Misc Language Dependency Lockfile Guard] 已拦截生成型依赖锁文件操作",
    "",
    ...(targets.length ? [`目标：${targets.join(", ")}`] : []),
    ...(bypass ? ["原因：bundle install --without-lock 会绕过 Gemfile.lock 更新"] : []),
    "这些锁文件必须由对应包管理器生成，不能直接编辑、重定向写入或绕过锁定。",
    "",
    "blockingContract:",
    "  observedFacts: 操作直接写入生成型锁文件，或显式绕过 Bundler 锁定。",
    "  harm: 解析状态与包管理器状态脱节，依赖安装不可复现。",
    "  unblockWhen: 使用包管理器正常解析并重新生成锁文件。",
    `  recovery: 撤销直接写入，使用 ${generators.join(" / ") || "bundle install"} 恢复。`,
  ].join("\n");
}

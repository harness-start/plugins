import { basename } from "node:path";

const LOCKFILES = new Map([
  ["pubspec.lock", "dart pub / flutter pub"],
  ["package.resolved", "Swift Package Manager"],
  ["podfile.lock", "CocoaPods"],
]);

function cleanPath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/\/+$/u, "");
}

export function isMobileLockfile(value) {
  return LOCKFILES.has(basename(cleanPath(value)).toLowerCase());
}

function patchPaths(blob) {
  if (typeof blob !== "string") return [];
  return [...blob.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)].map((match) => match[1].trim());
}

function shellTargets(command) {
  if (typeof command !== "string") return [];
  const targets = [];
  for (const match of command.matchAll(/(?:>|>>)\s*([^\s;&|'"`]+)/gu)) targets.push(match[1]);
  for (const segment of command.split(/&&|\|\||[;|\n]/u)) {
    if (!/\btee\b/iu.test(segment)) continue;
    targets.push(...(segment.match(/"[^"]*"|'[^']*'|\S+/gu) ?? []).slice(1).map((token) => token.replace(/^(['"])(.*)\1$/u, "$2")));
  }
  return targets;
}

export function collectMobileLockfiles(toolName, input = {}) {
  const normalized = String(toolName ?? "").toLowerCase();
  const candidates = [input.file_path, input.filePath, input.path, input.target_file];
  if (/apply_?patch|applypatch/iu.test(normalized)) candidates.push(...patchPaths([input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n")));
  if (/bash|shell|exec|local_shell/iu.test(normalized)) candidates.push(...shellTargets(input.command ?? input.cmd));
  return [...new Set(candidates.filter(isMobileLockfile))];
}

export function mobileLockfileDeny(targets) {
  const generators = [...new Set(targets.map((target) => LOCKFILES.get(basename(cleanPath(target)).toLowerCase())))];
  return [
    "[Mobile Dependency Lockfile Guard] 已拦截生成型依赖锁文件修改",
    "",
    `目标：${targets.join(", ")}`,
    `生成工具：${generators.join(", ")}`,
    "",
    "这些文件必须由对应包管理器生成，不应直接编辑或通过 shell 重写。",
    "",
    "blockingContract:",
    "  observedFacts: 写入目标是 pubspec.lock、Package.resolved 或 Podfile.lock。",
    "  harm: 手工修改会使解析状态与包管理器状态脱节，依赖安装不可复现。",
    "  unblockWhen: 依赖变更由对应包管理器执行并重新生成锁文件。",
    `  recovery: 撤销直接写入，使用 ${generators.join(" / ")} 重新解析依赖。`,
  ].join("\n");
}

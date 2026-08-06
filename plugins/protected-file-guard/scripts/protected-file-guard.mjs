#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  matchRule,
  resolveRules,
} from "./lib/protected-file-policy.mjs";

const CONFIG_FILE_NAMES = [
  ".protected-file-guard.mjs",
  ".protected-file-guard.cjs",
  ".protected-file-guard.js",
];

const FILE_TOOL_NAMES = new Set([
  "applypatch",
  "edit",
  "multiedit",
  "notebookedit",
  "write",
]);

function warn(message) {
  process.stderr.write(`[protected-file-guard] ${message}\n`);
}

async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}

function extractToolName(event) {
  return (
    event?.tool_name ??
    event?.toolName ??
    event?.tool?.name ??
    ""
  );
}

function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
}

function extractToolInput(event) {
  return (
    event?.tool_input ??
    event?.toolInput ??
    event?.tool?.input ??
    event?.input ??
    {}
  );
}

function extractCwd(event) {
  return (
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd()
  );
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

export function extractPatchTargets(payload) {
  if (typeof payload !== "string") return [];
  const targets = [];
  for (const line of payload.split("\n")) {
    const file = line.match(
      /^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u,
    );
    if (file) targets.push(stripMatchingQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) targets.push(stripMatchingQuotes(move[1]));
  }
  return targets;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "output_file",
    "outputFile",
    "notebook_path",
    "notebookPath",
  ]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}

export function extractFileTargets(event) {
  const toolName = canonicalToolName(extractToolName(event));
  if (!FILE_TOOL_NAMES.has(toolName)) return [];

  const input = extractToolInput(event);
  const cwd = extractCwd(event);
  const targets = objectPaths(input);
  const patchPayload = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
        .filter((value) => typeof value === "string")
        .join("\n");
  targets.push(...extractPatchTargets(patchPayload));

  return [
    ...new Set(
      targets
        .map(stripMatchingQuotes)
        .filter(Boolean)
        .map((path) =>
          isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
        ),
    ),
  ];
}

export function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function relativeOrAbsolute(filePath, base) {
  const candidate = relative(base, filePath);
  if (
    candidate &&
    candidate !== ".." &&
    !candidate.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(candidate)
  ) {
    return candidate.replaceAll("\\", "/");
  }
  return filePath.replaceAll("\\", "/");
}

export function resolvePhysicalTarget(filePath) {
  let cursor = filePath;
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return resolve(realpathSync(cursor), ...suffix);
  } catch {
    return null;
  }
}

export function matchPathsForTarget(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const paths = [relativeOrAbsolute(filePath, base)];
  const physical = resolvePhysicalTarget(filePath);
  if (physical) paths.push(relativeOrAbsolute(physical, base));
  return [...new Set(paths)];
}

export async function loadUserConfig(repoRoot) {
  if (!repoRoot) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = join(repoRoot, name);
    if (!existsSync(configPath)) continue;
    try {
      const loaded = await import(pathToFileURL(configPath).href);
      return loaded.default ?? loaded;
    } catch (error) {
      warn(`failed to load ${name}: ${error.message}`);
      return null;
    }
  }
  return null;
}

function displayPath(filePath, repoRoot, cwd) {
  return relativeOrAbsolute(filePath, repoRoot ?? cwd);
}

export function formatDeny(findings) {
  const shown = findings.slice(0, 10);
  const details = shown.flatMap((finding) => [
    `- ${finding.path}`,
    `  rule: ${finding.rule.id}`,
    `  reason: ${finding.rule.reason ?? "目标路径受项目保护规则约束"}`,
  ]);
  if (findings.length > shown.length) {
    details.push(`- 另有 ${findings.length - shown.length} 个受保护目标`);
  }
  const recoveries = [
    ...new Set(
      shown.map((finding) =>
        finding.rule.recovery ??
        "改为修改权威源文件；如确需放行，请在项目配置中添加更窄的 allow 规则。"
      ),
    ),
  ];
  return [
    "[Protected File Guard] 已拦截受保护文件修改",
    "",
    ...details,
    "",
    "blockingContract:",
    "  observedFacts: 文件工具的一个或多个目标命中了受保护路径规则。",
    "  harm: 直接编辑 lockfile 或第三方依赖目录会使生成状态与权威依赖声明脱节，且改动可能在重新安装时丢失。",
    "  unblockWhen: 操作不再写入受保护路径，或项目配置以更具体的 allow 规则明确放行。",
    "  recovery:",
    ...recoveries.map((recovery) => `    - ${recovery}`),
  ].join("\n");
}

function denyOutput(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve(extractCwd(event));
  const targets = extractFileTargets(event);
  if (targets.length === 0) return;

  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const rules = resolveRules(userConfig);
  const findings = [];

  for (const target of targets) {
    const rule = matchRule(matchPathsForTarget(target, repoRoot, cwd), rules);
    if (!rule || rule.mode === "allow") continue;
    findings.push({ path: displayPath(target, repoRoot, cwd), rule });
  }
  if (findings.length === 0) return;
  process.stdout.write(`${JSON.stringify(denyOutput(formatDeny(findings)))}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}

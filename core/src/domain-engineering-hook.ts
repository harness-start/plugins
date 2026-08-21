import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DOMParser } from "@xmldom/xmldom";

import { eventCwd, eventSessionId, eventToolName, isRecord, readStdinJson, type HookEvent } from "./hook-event.ts";
import { additionalContext, preToolDeny, writeJson } from "./hook-output.ts";
import { extractFileTargets as extractCoreFileTargets, extractShellCommand, isFileMutationTool, isShellTool } from "./hook-targets.ts";
import { tokenizeShell } from "./shell-parse.ts";

export type DomainCheckMode = "block" | "off" | "report";

export type DomainProtectionRule = {
  id: string;
  match: RegExp;
  reason: string;
  recovery: string;
};

export type DomainValidatorKind =
  | "composer"
  | "eslint"
  | "gofmt"
  | "helm"
  | "javascript"
  | "json"
  | "kubectl"
  | "nix"
  | "php"
  | "plist"
  | "python"
  | "ruff"
  | "rustfmt"
  | "swift"
  | "typescript"
  | "xml";

export type DomainValidator = {
  id: string;
  kind: DomainValidatorKind;
  match: RegExp;
  contentMatch?: RegExp;
  mode: DomainCheckMode;
};

export type DomainSourceScanHit = {
  line: number;
  code: string;
  message: string;
};

export type DomainSourceScan = {
  id: string;
  match: RegExp;
  mode: DomainCheckMode;
  inspect: (filePath: string, source: string) => readonly DomainSourceScanHit[];
};

export type DomainCheckFinding = {
  check: string;
  mode: Exclude<DomainCheckMode, "off">;
  path: string;
  message: string;
  missingTool?: string;
};

export type DomainActivationContext = {
  root: string;
  targetPath: string;
  relativePath: string;
};

export type DomainEngineeringPolicy = {
  plugin: string;
  displayName: string;
  protections: readonly DomainProtectionRule[];
  validators: readonly DomainValidator[];
  sourceScans?: readonly DomainSourceScan[];
  active?: (context: DomainActivationContext) => boolean;
};

type DomainConfig = {
  checks: Record<string, DomainCheckMode>;
  rules: Array<{ id: string; match: RegExp; mode: "allow" | "block"; reason?: string; recovery?: string }>;
  maxFiles: number;
  timeoutMs: number;
  missingTools: "report-once" | "silent";
};

type Finding = DomainCheckFinding;

const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|", "&"]);
const SIMPLE_WRAPPERS = new Set(["busybox", "command", "exec", "nohup", "time"]);
const SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function warn(plugin: string, message: string): void {
  process.stderr.write(`[${plugin}] ${message}\n`);
}

function regexMatches(pattern: RegExp, value: string): boolean {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

function tokenBasename(token: unknown): string {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}

function splitSimpleCommands(tokens: string[]): string[][] {
  const commands: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
      if (current.length) commands.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}

function unwrapCommand(tokens: string[]): string[] {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_WRAPPERS.has(name) || name === "nice" || name === "stdbuf") {
      index += 1;
      while (tokens[index]?.startsWith("-") && tokens[index] !== "--") index += 1;
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo" || name === "env") {
      index += 1;
      while (tokens[index]?.startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (name === "sudo" && option && ["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (tokens[index]?.startsWith("-")) index += 1;
      if (tokens[index] && !tokens[index]?.startsWith("-")) index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index);
}

function nonFlagOperands(args: string[]): string[] {
  const values: string[] = [];
  let skip = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (skip) {
      skip = false;
      continue;
    }
    if (arg === "--") return [...values, ...args.slice(index + 1)];
    if (arg.startsWith("-")) {
      if (["-t", "--target-directory"].includes(arg)) skip = true;
      continue;
    }
    values.push(arg);
  }
  return values;
}

function targetDirectory(args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-t" || arg === "--target-directory") return args[index + 1] ?? "";
    if (arg?.startsWith("--target-directory=")) return arg.slice("--target-directory=".length);
  }
  return "";
}

function sedWriteTargets(args: string[]): string[] {
  if (!args.some((arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg))) return [];
  const values = nonFlagOperands(args);
  return values.length > 1 ? values.slice(1) : values;
}

function commandWriteTargets(tokens: string[]): string[] {
  const command = unwrapCommand(tokens);
  const name = tokenBasename(command[0]);
  const args = command.slice(1);
  const operands = nonFlagOperands(args);
  const target = targetDirectory(args);
  if (name === "sed") return sedWriteTargets(args);
  if (name === "cp" || name === "install") return target ? [target] : operands.slice(-1);
  if (name === "mv") return target ? [target, ...operands] : operands;
  if (name === "rm" || name === "touch") return operands;
  if (name === "dd") return args.filter((arg) => arg.startsWith("of=")).map((arg) => arg.slice(3));
  return [];
}

export function extractDomainShellWriteTargets(command: unknown): string[] {
  const text = String(command ?? "");
  const values: string[] = [];
  const push = (raw: unknown) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) values.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const tokens of splitSimpleCommands(tokenizeShell(text))) {
    for (const path of commandWriteTargets(tokens)) push(path);
  }
  return [...new Set(values)];
}

export function extractDomainTargets(event: HookEvent): string[] {
  const cwd = resolve(eventCwd(event));
  let targets: string[] = [];
  if (isShellTool(eventToolName(event))) targets = extractDomainShellWriteTargets(extractShellCommand(event));
  else if (isFileMutationTool(eventToolName(event))) targets = extractCoreFileTargets(event);
  return [...new Set(targets.map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

function repoRoot(cwd: string): string | null {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function relativePath(filePath: string, base: string): string {
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate && candidate !== ".." && !candidate.startsWith("../") ? candidate : filePath.replaceAll("\\", "/");
}

export function nearestProjectFile(root: string, targetPath: string, names: readonly string[]): string | null {
  let cursor = existsSync(targetPath) && statSync(targetPath).isDirectory() ? targetPath : dirname(targetPath);
  const boundary = resolve(root);
  while (cursor === boundary || cursor.startsWith(`${boundary}/`)) {
    for (const name of names) {
      const candidate = join(cursor, name);
      if (existsSync(candidate)) return candidate;
    }
    if (cursor === boundary) break;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

export function packageDeclaresDependency(context: DomainActivationContext, dependency: string): boolean {
  const packagePath = nearestProjectFile(context.root, context.targetPath, ["package.json"]);
  if (!packagePath) return false;
  try {
    const value: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (!isRecord(value)) return false;
    return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
      .some((key) => isRecord(value[key]) && dependency in value[key]);
  } catch {
    return false;
  }
}

export function repoContainsPath(root: string, pattern: RegExp): boolean {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) return false;
  return result.stdout.split("\n").some((path) => regexMatches(pattern, path));
}

function physicalTarget(filePath: string): string | null {
  let cursor = filePath;
  const suffix: string[] = [];
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

function matchPaths(filePath: string, base: string): string[] {
  const paths = [relativePath(filePath, base)];
  const physical = physicalTarget(filePath);
  if (physical) paths.push(relativePath(physical, base));
  return [...new Set(paths)];
}

function validMode(value: unknown): value is DomainCheckMode {
  return value === "block" || value === "report" || value === "off";
}

async function loadConfig(policy: DomainEngineeringPolicy, root: string | null): Promise<DomainConfig> {
  const defaults: DomainConfig = { checks: {}, rules: [], maxFiles: 12, timeoutMs: 10000, missingTools: "report-once" };
  if (!root) return defaults;
  const path = join(root, `.${policy.plugin}.mjs`);
  if (!existsSync(path)) return defaults;
  try {
    const loaded: unknown = await import(pathToFileURL(path).href);
    const raw = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    if (!isRecord(raw)) return defaults;
    const checks = isRecord(raw.checks)
      ? Object.fromEntries(Object.entries(raw.checks).filter((entry): entry is [string, DomainCheckMode] => validMode(entry[1])))
      : {};
    const rules = Array.isArray(raw.rules) ? raw.rules.flatMap((rule, index) => {
      if (!isRecord(rule) || !(rule.match instanceof RegExp) || (rule.mode !== "allow" && rule.mode !== "block")) {
        warn(policy.plugin, `rules[${index}] is invalid and was skipped`);
        return [];
      }
      const mode: "allow" | "block" = rule.mode;
      return [{
        id: typeof rule.id === "string" ? rule.id : `user-rule-${index + 1}`,
        match: rule.match,
        mode,
        ...(typeof rule.reason === "string" ? { reason: rule.reason } : {}),
        ...(typeof rule.recovery === "string" ? { recovery: rule.recovery } : {}),
      }];
    }) : [];
    const limits = isRecord(raw.limits) ? raw.limits : {};
    return {
      checks,
      rules,
      maxFiles: typeof limits.maxFiles === "number" && Number.isInteger(limits.maxFiles) && limits.maxFiles >= 1 && limits.maxFiles <= 100 ? limits.maxFiles : 12,
      timeoutMs: typeof limits.timeoutMs === "number" && Number.isInteger(limits.timeoutMs) && limits.timeoutMs >= 1000 && limits.timeoutMs <= 60000 ? limits.timeoutMs : 10000,
      missingTools: raw.missingTools === "silent" ? "silent" : "report-once",
    };
  } catch (error) {
    warn(policy.plugin, `failed to load .${policy.plugin}.mjs: ${error instanceof Error ? error.message : String(error)}`);
    return defaults;
  }
}

function protectionFor(paths: readonly string[], policy: DomainEngineeringPolicy, config: DomainConfig): DomainProtectionRule | null {
  for (const rule of config.rules) {
    if (!paths.some((path) => regexMatches(rule.match, path))) continue;
    if (rule.mode === "allow") return null;
    return {
      id: rule.id,
      match: rule.match,
      reason: rule.reason ?? "The target is covered by a project protection rule.",
      recovery: rule.recovery ?? "Change the authoritative source or add a narrower allow rule.",
    };
  }
  return policy.protections.find((rule) => paths.some((path) => regexMatches(rule.match, path))) ?? null;
}

function formatDeny(policy: DomainEngineeringPolicy, findings: Array<{ path: string; rule: DomainProtectionRule }>): string {
  return [
    `[Protected File Guard] ${policy.displayName}: Protected file modification blocked`,
    "",
    ...findings.slice(0, 10).flatMap(({ path, rule }) => [`- ${path}`, `  rule: ${rule.id}`, `  reason: ${rule.reason}`]),
    "",
    "blockingContract:",
    "  observedFacts: One or more direct write targets matched a domain-owned generated dependency path.",
    "  harm: Direct edits can diverge generated dependency state from its authoritative declarations.",
    "  unblockWhen: Use the ecosystem package manager or add a narrow project-owned allow rule.",
    "  recovery:",
    ...[...new Set(findings.map(({ rule }) => rule.recovery))].map((value) => `    - ${value}`),
  ].join("\n");
}

function executable(name: string, root: string, local: readonly string[] = []): string | null {
  const candidates = [...local.map((item) => join(root, item)), ...String(process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").map((part) => join(part, name))];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      if (process.platform !== "win32") accessSync(path, constants.X_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

function commandFor(kind: DomainValidatorKind, filePath: string): { command: string | null; args: string[]; local?: string[] } | null {
  if (kind === "javascript") return { command: process.execPath, args: ["--check", filePath] };
  if (kind === "typescript") return { command: "esbuild", args: [filePath, "--log-level=error", "--format=esm"], local: ["node_modules/.bin/esbuild"] };
  if (kind === "python") return { command: "python3", args: ["-c", "import pathlib,sys; p=sys.argv[1]; compile(pathlib.Path(p).read_bytes(), p, 'exec')", filePath], local: [".venv/bin/python3", "venv/bin/python3"] };
  if (kind === "ruff") return { command: "ruff", args: ["check", "--no-fix", "--output-format", "concise", filePath], local: [".venv/bin/ruff", "venv/bin/ruff"] };
  if (kind === "php") return { command: "php", args: ["-l", filePath] };
  if (kind === "composer") return { command: "composer", args: ["validate", "--no-check-publish", "--no-check-lock", filePath], local: ["vendor/bin/composer"] };
  if (kind === "eslint") return { command: "eslint", args: [filePath, "--format", "compact"], local: ["node_modules/.bin/eslint"] };
  if (kind === "swift") return { command: "swiftc", args: ["-parse", filePath] };
  if (kind === "plist") return { command: "plutil", args: ["-lint", filePath] };
  if (kind === "gofmt") return { command: "gofmt", args: ["-d", filePath] };
  if (kind === "rustfmt") return { command: "rustfmt", args: ["--check", filePath] };
  if (kind === "nix") return { command: "nix-instantiate", args: ["--parse", filePath] };
  if (kind === "kubectl") return { command: "kubectl", args: ["apply", "--dry-run=client", "--validate=false", "-f", filePath] };
  if (kind === "helm") return { command: "helm", args: ["lint", dirname(filePath)] };
  return null;
}

function internalValidation(kind: DomainValidatorKind, filePath: string): string | null | undefined {
  if (kind === "json") {
    try {
      JSON.parse(readFileSync(filePath, "utf8"));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  if (kind === "xml") {
    const errors: string[] = [];
    try {
      new DOMParser({ onError: (level, message) => { if (level === "fatalError" || level === "error") errors.push(message); } }).parseFromString(readFileSync(filePath, "utf8"), "application/xml");
      return errors.length ? errors.join("\n") : null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

export function sourceScanFindings(
  scan: DomainSourceScan,
  relativePath: string,
  source: string,
  mode: DomainCheckMode,
  filePath = relativePath,
): DomainCheckFinding[] {
  if (mode === "off" || !regexMatches(scan.match, relativePath)) return [];
  return scan.inspect(filePath, source).map((hit) => ({
    check: scan.id,
    mode,
    path: `${relativePath}:${hit.line}`,
    message: `${hit.code}: ${hit.message}`,
  }));
}

function validateFile(validator: DomainValidator, filePath: string, root: string, timeoutMs: number): Finding | null {
  if (validator.contentMatch) {
    try {
      if (!regexMatches(validator.contentMatch, readFileSync(filePath, "utf8"))) return null;
    } catch {
      return null;
    }
  }
  const internal = internalValidation(validator.kind, filePath);
  if (internal !== undefined) return internal ? { check: validator.id, mode: validator.mode === "off" ? "report" : validator.mode, path: relativePath(filePath, root), message: internal } : null;
  const spec = commandFor(validator.kind, filePath);
  if (!spec?.command) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: "No validator implementation is available." };
  const command = spec.command === process.execPath ? process.execPath : executable(spec.command, root, spec.local) ;
  if (!command) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: `${spec.command} was not found; the check was skipped.`, missingTool: spec.command };
  const result = spawnSync(command, spec.args, { cwd: root, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  if (result.error) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: result.error.message };
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (validator.kind === "gofmt" && result.status === 0 && output) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: output };
  if ((result.status ?? 0) !== 0) return { check: validator.id, mode: validator.mode === "off" ? "report" : validator.mode, path: relativePath(filePath, root), message: output || `checker exit code ${result.status}` };
  return null;
}

function shouldReportMissingTool(policy: DomainEngineeringPolicy, root: string, session: string, finding: Finding, mode: DomainConfig["missingTools"]): boolean {
  if (!finding.missingTool) return true;
  if (mode === "silent") return false;
  const identity = createHash("sha256")
    .update(`${policy.plugin}\0${session}\0${root}\0${finding.check}\0${finding.missingTool}`)
    .digest("hex");
  const markerRoot = join(tmpdir(), ".ai-experts-domain-engineering-missing");
  const marker = join(markerRoot, identity);
  if (existsSync(marker)) return false;
  try {
    mkdirSync(markerRoot, { recursive: true });
    writeFileSync(marker, "", { flag: "wx" });
  } catch {
    if (existsSync(marker)) return false;
  }
  return true;
}

async function runPre(policy: DomainEngineeringPolicy, event: HookEvent): Promise<void> {
  const cwd = resolve(eventCwd(event));
  const root = repoRoot(cwd) ?? cwd;
  const config = await loadConfig(policy, repoRoot(cwd));
  const findings = extractDomainTargets(event).flatMap((filePath) => {
    const path = relativePath(filePath, root);
    if (policy.active && !policy.active({ root, targetPath: filePath, relativePath: path })) return [];
    const rule = protectionFor(matchPaths(filePath, root), policy, config);
    return rule ? [{ path, rule }] : [];
  });
  if (findings.length) writeJson(preToolDeny(formatDeny(policy, findings)));
}

async function runPost(policy: DomainEngineeringPolicy, event: HookEvent): Promise<void> {
  const cwd = resolve(eventCwd(event));
  const discoveredRoot = repoRoot(cwd);
  const root = discoveredRoot ?? cwd;
  const config = await loadConfig(policy, discoveredRoot);
  const session = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
  const targets = extractDomainTargets(event).filter((filePath) => {
    if (!existsSync(filePath)) return false;
    try {
      const path = relativePath(filePath, root);
      return statSync(filePath).isFile()
        && statSync(filePath).size <= MAX_FILE_BYTES
        && !SKIP_PATH.test(path)
        && (!policy.active || policy.active({ root, targetPath: filePath, relativePath: path }));
    } catch {
      return false;
    }
  }).slice(0, config.maxFiles);
  const findings: Finding[] = [];
  for (const filePath of targets) {
    const path = relativePath(filePath, root);
    for (const validator of policy.validators) {
      const mode = config.checks[validator.id] ?? validator.mode;
      if (mode === "off" || !regexMatches(validator.match, path)) continue;
      const finding = validateFile({ ...validator, mode }, filePath, root, config.timeoutMs);
      if (finding && shouldReportMissingTool(policy, root, session, finding, config.missingTools)) findings.push(finding);
    }
    const scans = policy.sourceScans ?? [];
    if (!scans.length) continue;
    let source = "";
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    for (const scan of scans) {
      const mode = config.checks[scan.id] ?? scan.mode;
      findings.push(...sourceScanFindings(scan, path, source, mode, filePath));
    }
  }
  if (!findings.length) return;
  const text = [
    `[${policy.displayName}] Domain check results`,
    "",
    ...findings.flatMap((finding) => [`- [${finding.mode}] ${finding.check}: ${finding.path}`, `  ${finding.message}`]),
  ].join("\n");
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${text}\n`);
    process.exitCode = 2;
  } else writeJson(additionalContext("PostToolUse", text));
}

export async function runDomainEngineeringHook(policy: DomainEngineeringPolicy, phase: string | undefined): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (phase === "pre") await runPre(policy, event);
  else if (phase === "post") await runPost(policy, event);
  else warn(policy.plugin, `unknown hook phase ${String(phase)}`);
}

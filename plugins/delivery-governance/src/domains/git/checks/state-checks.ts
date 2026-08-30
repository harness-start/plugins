import { execFileSync } from "node:child_process";
import {
  existsSync, lstatSync, readFileSync, unlinkSync,
} from "node:fs";
import { basename, extname, join, posix, resolve } from "node:path";
import { isRecord } from "@harness/core/hook-event";

import {
  gitInvocations,
  type DeliveryAction,
  type DeliveryFinding,
  type GitInvocation,
} from "./command-rules.js";

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

type BoundaryRule = {
  id: string;
  prefix: string;
};

type BoundaryConfig = {
  rules: BoundaryRule[];
  error: string | null;
};

type ConcernFlags = {
  source: boolean;
  config: boolean;
};

function isTestFile(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  return /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)/iu.test(normalized)
    || /(?:^|\.)test\.[^.]+$/iu.test(basename(normalized))
    || /(?:^|\.)spec\.[^.]+$/iu.test(basename(normalized))
    || /_test\.go$/iu.test(normalized)
    || /Test\.php$/u.test(normalized);
}

function errorText(error: unknown): string {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}

function git(args: readonly string[], cwd: string): string | null {
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

function lines(args: readonly string[], cwd: string): string[] | null {
  const output = git(args, cwd);
  return output === null ? null : output ? output.split("\n").filter(Boolean) : [];
}

function finding(action: DeliveryAction, id: string, reason: string, recovery: string): DeliveryFinding {
  return { action, id, reason, recovery };
}

function processState(pid: number): "alive" | "dead" | "unknown" {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ESRCH") return "dead";
    return "unknown";
  }
}

function staleLock(invocation: GitInvocation): DeliveryFinding | null {
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
      "deny", "Git Lock Guard", `${lockPath} is not a regular lock file that can be handled safely`,
      "stop Git writes and manually inspect the Git directory and lock-file type",
    );
  }

  const age = Date.now() - snapshot.mtimeMs;
  if (age < LOCK_AGE_MS) {
    return finding(
      "deny", "Git Lock Guard", `index.lock is only ${Math.max(0, Math.round(age / 1000))} seconds old and has not passed the safety threshold`,
      "wait for the current Git operation to finish, then retry",
    );
  }

  let parsedPid: number | null = null;
  try {
    const match = readFileSync(lockPath, "utf8").slice(0, 64).match(/^(\d+)\s/u)?.[1];
    if (match !== undefined) parsedPid = Number(match);
  } catch {
    // keep null
  }
  if (parsedPid === null || !Number.isSafeInteger(parsedPid) || parsedPid <= 0) {
    return finding(
      "deny", "Git Lock Guard", "the stale index.lock has no verifiable holder PID; automatic deletion is refused",
      `confirm that no Git process is running, then delete ${lockPath} manually`,
    );
  }
  const pid = parsedPid;

  const holder = processState(pid);
  if (holder !== "dead") {
    return finding(
      "deny", "Git Lock Guard",
      holder === "alive" ? `PID ${pid} recorded by index.lock is still alive` : `cannot confirm that PID ${pid} has exited`,
      "wait for the holder to finish; handle the lock file only after confirming that the process exited",
    );
  }

  try {
    const current = lstatSync(lockPath);
    const sameFile = current.isFile() && !current.isSymbolicLink() &&
      current.dev === snapshot.dev && current.ino === snapshot.ino &&
      current.mtimeMs === snapshot.mtimeMs;
    if (!sameFile) {
      return finding(
        "deny", "Git Lock Guard", "index.lock changed during verification; automatic deletion is refused",
        "recheck the current Git holder and lock-file state",
      );
    }
    unlinkSync(lockPath);
    return finding(
      "report", "Git Lock Guard", `removed an index.lock that was ${Math.round(age / 1000)} seconds old after PID ${pid} exited`,
      "no action is required; if Git still fails, check for a new lock holder",
    );
  } catch (error: unknown) {
    return finding(
      "deny", "Git Lock Guard", `the stale index.lock could not be removed safely: ${errorText(error)}`,
      `confirm that no Git process is running, then delete ${lockPath} manually`,
    );
  }
}

function readBoundaryRules(root: string): BoundaryConfig {
  const configPath = join(root, ".ai-experts", "commit-boundaries.json");
  if (!existsSync(configPath)) return { rules: [], error: null };
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error: unknown) {
    return { rules: [], error: `failed to parse ${configPath}: ${errorText(error)}` };
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.boundaries)) {
    return { rules: [], error: `${configPath} must contain version: 1 and a boundaries array` };
  }
  const rules: BoundaryRule[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.boundaries.entries()) {
    if (
      !isRecord(item)
      || typeof item.id !== "string"
      || !item.id.trim()
      || ids.has(item.id)
      || !Array.isArray(item.prefixes)
      || item.prefixes.length === 0
    ) {
      return { rules: [], error: `boundaries[${index}] must have a unique non-empty id and a non-empty prefixes array` };
    }
    ids.add(item.id);
    for (const prefixValue of item.prefixes) {
      if (typeof prefixValue !== "string" || !prefixValue.trim()) {
        return { rules: [], error: `boundaries[${index}].prefixes may contain only non-empty strings` };
      }
      const segments = prefixValue.replaceAll("\\", "/").split("/");
      if (segments.includes("..")) {
        return { rules: [], error: `a prefix in boundaries[${index}] must not contain ..` };
      }
      const prefix = prefixValue.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
      rules.push({ id: item.id, prefix });
    }
  }
  rules.sort((left, right) => right.prefix.length - left.prefix.length);
  return { rules, error: null };
}

function boundaryFor(file: string, root: string, rules: readonly BoundaryRule[]): string {
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

function commitState(invocation: GitInvocation): DeliveryFinding[] {
  if (invocation.subcommand !== "commit" || invocation.args.some((arg) =>
    /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg),
  )) return [];

  const staged = lines(["diff", "--cached", "--name-only"], invocation.cwd);
  if (!staged) return [];
  const unstaged = lines(["diff", "--name-only"], invocation.cwd);
  const unstagedSet = new Set(unstaged ?? []);
  const overlap = staged.filter((file) => unstagedSet.has(file));
  const findings: DeliveryFinding[] = [];
  const commitAll = invocation.args.some((arg) => arg === "-a" || arg === "--all" || /^-[^-]*a/u.test(arg));
  if (overlap.length && !commitAll) {
    findings.push(finding(
      "report", "Partial Staging Guard",
      `${overlap.length} file(s) have both staged and unstaged changes: ${overlap.slice(0, 8).join(", ")}`,
      "inspect git diff --cached -- <file> and git diff -- <file> separately",
    ));
  }
  const files = commitAll ? [...new Set([...staged, ...(unstaged ?? [])])] : staged;
  if (!files.length) return findings;

  const root = git(["rev-parse", "--show-toplevel"], invocation.cwd) || invocation.cwd;
  const boundaryConfig = readBoundaryRules(root);
  if (boundaryConfig.error) {
    findings.push(finding(
      "deny", "Commit Scope Guard", boundaryConfig.error,
      "fix .ai-experts/commit-boundaries.json before committing again",
    ));
    return findings;
  }

  const nameStatus = lines(["diff", "--cached", "--name-status"], invocation.cwd);
  if (nameStatus?.length && nameStatus.every((line) => /^R\d*\t/u.test(line))) {
    if (files.length > 15) {
      findings.push(finding(
        "report", "Commit Scope Guard", `rename-only commit contains ${files.length} migration entries`,
        "confirm that every migration mapping has been reconciled",
      ));
    }
    return findings;
  }

  const groups = new Map<string, ConcernFlags>();
  for (const file of files) {
    const boundary = boundaryFor(file, root, boundaryConfig.rules);
    if (!groups.has(boundary)) groups.set(boundary, { source: false, config: false });
    const group = groups.get(boundary);
    if (!group) continue;
    const extension = extname(file).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension) && !isTestFile(file)) group.source = true;
    if (CONFIG_EXTENSIONS.has(extension) || /^(?:Dockerfile|Jenkinsfile|Makefile)$/u.test(basename(file))) group.config = true;
  }
  const mixed = [...groups.values()].some((group) => group.source && group.config);
  if (groups.size >= 2 || mixed) {
    findings.push(finding(
      "deny", "Commit Scope Guard",
      `commit crosses ${groups.size} manifest/explicit boundaries or mixes source with config/infra: ${[...groups.keys()].join(", ")}`,
      "unstage the batch and git add/commit each declared boundary and concern separately",
    ));
  } else if (files.length > 15) {
    findings.push(finding(
      "report", "Commit Scope Guard", `one commit contains ${files.length} files`,
      "check whether it can be split into smaller atomic commits",
    ));
  }
  return findings;
}

export function deliveryStateFindings(cwd: string, command: string): DeliveryFinding[] {
  return gitInvocations(command, cwd).flatMap((invocation) => {
    const lock = staleLock(invocation);
    return lock ? [lock, ...commitState(invocation)] : commitState(invocation);
  });
}

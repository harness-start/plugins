#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { currentOwnerCliArgv } from "../../../../../core/src/aio-cli.js";

const PROVIDERS = ["codex", "claude", "agy", "grok", "pi"] as const;
type Provider = typeof PROVIDERS[number];

type GitSnapshot = {
  coverage: "complete" | "partial";
  head: string | null;
  indexHash: string;
  statusHash: string;
  touchedFiles: string[];
  statusByPath: Record<string, string>;
  fingerprints: Record<string, string>;
};

type RelayResult = Record<string, unknown> & {
  status?: unknown;
  exitCode?: unknown;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(root: string, args: string[], allowFailure = false): Buffer | null {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status === 0) return result.stdout;
  if (allowFailure) return null;
  const detail = result.stderr?.toString("utf8").trim();
  throw new Error(detail || `git ${args.join(" ")} exited ${String(result.status)}`);
}

function parseStatus(raw: Buffer): { paths: string[]; statusByPath: Record<string, string> } {
  const fields = raw.toString("utf8").split("\0");
  const statusByPath: Record<string, string> = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const status = field.slice(0, 2);
    const path = field.slice(3);
    if (path) statusByPath[path] = status;
    if (/[RC]/u.test(status)) {
      const source = fields[index + 1];
      if (source) statusByPath[source] = status;
      index += 1;
    }
  }
  return { paths: Object.keys(statusByPath).toSorted(), statusByPath };
}

function pathFingerprint(root: string, path: string): { hash: string; complete: boolean } {
  const hash = createHash("sha256");
  let complete = true;
  const absolute = resolve(root, path);
  try {
    const stat = lstatSync(absolute);
    hash.update(`mode:${stat.mode};`);
    if (stat.isSymbolicLink()) hash.update(`symlink:${readlinkSync(absolute)};`);
    else if (stat.isFile()) hash.update(readFileSync(absolute));
    else {
      hash.update(`other:${stat.isDirectory() ? "directory" : "special"};`);
      complete = false;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") hash.update("missing;");
    else {
      hash.update(`unreadable:${code ?? "unknown"};`);
      complete = false;
    }
  }
  const index = git(root, ["ls-files", "--stage", "-z", "--", path], true);
  if (index === null) complete = false;
  else hash.update(index);
  return { hash: hash.digest("hex"), complete };
}

function captureGitSnapshot(root: string): GitSnapshot {
  const rawStatus = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!rawStatus) throw new Error("git status returned no output buffer");
  const parsed = parseStatus(rawStatus);
  const fingerprints: Record<string, string> = {};
  let coverage: GitSnapshot["coverage"] = "complete";
  for (const path of parsed.paths) {
    const fingerprint = pathFingerprint(root, path);
    fingerprints[path] = fingerprint.hash;
    if (!fingerprint.complete) coverage = "partial";
  }
  const head = git(root, ["rev-parse", "--verify", "HEAD"], true)?.toString("utf8").trim() || null;
  const index = git(root, ["ls-files", "--stage", "-z"]);
  if (!index) throw new Error("git ls-files returned no output buffer");
  return {
    coverage,
    head,
    indexHash: sha256(index),
    statusHash: sha256(rawStatus),
    touchedFiles: parsed.paths,
    statusByPath: parsed.statusByPath,
    fingerprints,
  };
}

function changedSinceBaseline(before: GitSnapshot, after: GitSnapshot): string[] {
  const paths = new Set([...before.touchedFiles, ...after.touchedFiles]);
  return [...paths].filter((path) =>
    before.fingerprints[path] !== after.fingerprints[path]
      || before.statusByPath[path] !== after.statusByPath[path]
  ).toSorted();
}

function optionValue(argv: string[], option: string): string | undefined {
  const index = argv.lastIndexOf(option);
  return index < 0 ? undefined : argv[index + 1];
}

function pluginRoot(): string {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  return resolve(dirname(currentOwnerCliArgv()[0] ?? process.argv[1] ?? process.cwd()), "../..");
}

function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function runRelay(relay: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveExit) => {
    const child = spawn(process.execPath, [relay, ...args], { env, stdio: "inherit" });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    const onInterrupt = () => forward("SIGINT");
    const onTerminate = () => forward("SIGTERM");
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
    child.once("error", (error) => {
      process.stderr.write(`[harness] unable to start delegation relay: ${error.message}\n`);
    });
    child.once("close", (code, signal) => {
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
      resolveExit(code ?? (signal ? 1 : 0));
    });
  });
}

function isProvider(value: string | undefined): value is Provider {
  return PROVIDERS.includes(value as Provider);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [provider, ...providerArgs] = argv;
  if (!isProvider(provider)) {
    process.stderr.write("usage: harness delegate <codex|claude|agy|grok|pi> [provider options]\n");
    return 2;
  }
  if (process.env.HARNESS_DELEGATION_DEPTH) {
    process.stderr.write("[harness] nested delegate invocations are not supported\n");
    return 2;
  }
  if (providerArgs.includes("--lane")) {
    process.stderr.write("[harness] --lane is not part of the owner delegation protocol; select one provider explicitly\n");
    return 2;
  }
  if (provider === "codex" && providerArgs.includes("--skip-git-repo-check")) {
    process.stderr.write("[harness] --skip-git-repo-check is incompatible with the required Git audit\n");
    return 2;
  }

  const requestedCwd = optionValue(providerArgs, "--cd") ?? process.cwd();
  let gitRoot: string;
  try {
    const root = git(resolve(requestedCwd), ["rev-parse", "--show-toplevel"]);
    if (!root) throw new Error("git did not return a worktree root");
    gitRoot = realpathSync(root.toString("utf8").trim());
  } catch (error) {
    process.stderr.write(`[harness] delegation requires a Git worktree: ${String(error)}\n`);
    return 1;
  }

  const configuredOutDir = optionValue(providerArgs, "--out-dir");
  const outDir = configuredOutDir
    ? resolve(configuredOutDir)
    : mkdtempSync(join(tmpdir(), `harness-${provider}-delegate-`));
  const relayArgs = configuredOutDir ? providerArgs : [...providerArgs, "--out-dir", outDir];
  const relay = resolve(pluginRoot(), "skills", `${provider}-delegate`, "scripts", "relay.mjs");
  if (!existsSync(relay)) {
    process.stderr.write(`[harness] bundled ${provider} relay is missing: ${relay}\n`);
    return 1;
  }

  let before: GitSnapshot;
  try {
    before = captureGitSnapshot(gitRoot);
  } catch (error) {
    process.stderr.write(`[harness] unable to capture the pre-dispatch Git audit: ${String(error)}\n`);
    return 1;
  }

  const relayExitCode = await runRelay(relay, relayArgs, {
    ...process.env,
    HARNESS_DELEGATION_DEPTH: "1",
  });

  let after: GitSnapshot;
  try {
    after = captureGitSnapshot(gitRoot);
  } catch (error) {
    process.stderr.write(`[harness] unable to capture the post-dispatch Git audit: ${String(error)}\n`);
    return relayExitCode || 1;
  }

  const resultPath = join(outDir, "result.json");
  if (!existsSync(resultPath)) return relayExitCode;

  let result: RelayResult;
  try {
    result = JSON.parse(readFileSync(resultPath, "utf8")) as RelayResult;
  } catch (error) {
    process.stderr.write(`[harness] unable to augment relay result: ${String(error)}\n`);
    return relayExitCode || 1;
  }

  const indexChanged = before.indexHash !== after.indexHash;
  const headChanged = before.head !== after.head;
  const boundaryViolation = indexChanged || headChanged;
  const providerStatus = result.status ?? null;
  const providerExitCode = result.exitCode ?? relayExitCode;
  result.harnessAudit = {
    schema: "harness-delegation.audit.v1",
    provider,
    protocolVerification: "offline",
    liveProviderVerification: "unverified",
    gitRoot,
    baselineTouchedFiles: before.touchedFiles,
    finalTouchedFiles: after.touchedFiles,
    changedSinceBaseline: changedSinceBaseline(before, after),
    baselineStatusHash: before.statusHash,
    finalStatusHash: after.statusHash,
    coverage: before.coverage === "complete" && after.coverage === "complete" ? "complete" : "partial",
    attribution: "unavailable",
    headBefore: before.head,
    headAfter: after.head,
    headChanged,
    indexChanged,
    providerStatus,
    providerExitCode,
    limitations: [
      "Git-visible final state cannot attribute concurrent writes to the delegated provider.",
      "Ignored paths, submodule internals, and changes perfectly restored before the final snapshot are outside this audit.",
    ],
  };
  if (boundaryViolation) {
    result.status = "failed";
    result.exitCode = 1;
    result.error = "delegated implementers must not commit or change the Git index; inspect the worktree and recover explicitly";
  }
  writeJsonAtomic(resultPath, result);

  if (boundaryViolation) {
    process.stderr.write("[harness] delegation boundary violation: HEAD or the Git index changed; result marked failed\n");
    return 1;
  }
  return relayExitCode;
}

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

import type { ReportWindow } from "./transcript-scan.js";
import { sanitizeSnippet } from "./transcript-scan.js";

export type CommandResult = { code: number; stdout: string; stderr: string };
export type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<CommandResult>;

export type EvidenceRecordV2 = {
  id: string;
  type: "transcript-session" | "git-commit" | "forge-item";
  timestamp: string;
  locator: string;
  digest: string;
  ownership: "attributed" | "employee-attested" | "unverified";
  verification: "fact" | "employee-attested" | "inference" | "unverified";
  summary: string;
};

export type EvidenceBundleV2 = {
  schema: "EvidenceBundleV2";
  window: { label: string; start: string; end: string };
  sources: {
    transcript: { status: "collected"; sessions: number };
    git: { status: "collected" | "skipped"; repositories: number };
    remote: { status: "collected" | "skipped" | "unavailable"; items: number };
  };
  records: EvidenceRecordV2[];
  dataGaps: string[];
};

export type EvidenceSession = {
  cwd?: string | null | undefined;
  platform?: string | undefined;
  sessionId?: string | undefined;
  firstEventAt?: string | undefined;
  lastEventAt?: string | undefined;
};

export type CollectEvidenceOptions = {
  window: ReportWindow;
  sessions?: EvidenceSession[] | undefined;
  repos?: string[] | undefined;
  skipGit?: boolean | undefined;
  skipRemote?: boolean | undefined;
  maxRepos?: number | undefined;
  maxCommits?: number | undefined;
  home?: string | undefined;
  run?: CommandRunner | undefined;
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableRecord(type: EvidenceRecordV2["type"], timestamp: string, locator: string, summary: string): Pick<EvidenceRecordV2, "id" | "digest"> {
  const value = `${type}\u001f${timestamp}\u001f${locator}\u001f${summary}`;
  const hash = digest(value);
  return { id: `E-${hash.slice(0, 12)}`, digest: hash };
}

export const spawnCommand: CommandRunner = (command, args, cwd) => new Promise((resolvePromise) => {
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", (error) => resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}` }));
  child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
});

function boundedInteger(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`${label} expects an integer from 1 to ${maximum}`);
  return result;
}

function clean(value: string, home: string): string {
  return sanitizeSnippet(value, home);
}

async function git(run: CommandRunner, repo: string, args: string[]): Promise<CommandResult> {
  return run("git", ["-C", repo, ...args]);
}

async function resolveRepositories(options: CollectEvidenceOptions, run: CommandRunner, gaps: string[]): Promise<string[]> {
  const requested = [
    ...(options.sessions ?? []).map((session) => session.cwd).filter((cwd): cwd is string => Boolean(cwd)),
    ...(options.repos ?? []),
  ];
  const roots = new Set<string>();
  const maximum = boundedInteger(options.maxRepos, 12, 50, "--max-repos");
  for (const candidate of requested) {
    if (roots.size >= maximum) break;
    const result = await git(run, resolve(candidate), ["rev-parse", "--show-toplevel"]);
    if (result.code === 0 && result.stdout.trim()) roots.add(resolve(result.stdout.trim()));
    else gaps.push(`Git root unavailable for ${basename(candidate) || "repository"}`);
  }
  if (requested.length > maximum) gaps.push(`candidate repositories ${requested.length} exceed --max-repos=${maximum}`);
  return [...roots].sort();
}

async function collectCommits(repo: string, options: CollectEvidenceOptions, run: CommandRunner, home: string, gaps: string[]): Promise<EvidenceRecordV2[]> {
  const [nameResult, emailResult] = await Promise.all([
    git(run, repo, ["config", "--get", "user.name"]),
    git(run, repo, ["config", "--get", "user.email"]),
  ]);
  const configuredName = nameResult.code === 0 ? nameResult.stdout.trim().toLowerCase() : "";
  const configuredEmail = emailResult.code === 0 ? emailResult.stdout.trim().toLowerCase() : "";
  if (!configuredName && !configuredEmail) gaps.push(`Git author identity unavailable for ${basename(repo)}`);
  const maxCommits = boundedInteger(options.maxCommits, 100, 500, "--max-commits");
  const result = await git(run, repo, [
    "log",
    `--since=${new Date(options.window.startMs).toISOString()}`,
    `--until=${new Date(options.window.endMs).toISOString()}`,
    `--max-count=${maxCommits}`,
    "--format=%H%x1f%cI%x1f%an%x1f%ae%x1f%s",
  ]);
  if (result.code !== 0) {
    gaps.push(`Git log unavailable for ${basename(repo)}`);
    return [];
  }
  const records: EvidenceRecordV2[] = [];
  for (const line of result.stdout.split(/\r?\n/u).filter(Boolean)) {
    const [hash = "", timestamp = "", authorName = "", authorEmail = "", ...subjectParts] = line.split("\u001f");
    if (!hash || !timestamp) continue;
    const summary = clean(subjectParts.join("\u001f"), home);
    const locator = `${basename(repo)}@${hash.slice(0, 12)}`;
    const attributed = Boolean(
      (configuredEmail && authorEmail.toLowerCase() === configuredEmail)
      || (configuredName && authorName.toLowerCase() === configuredName),
    );
    records.push({
      ...stableRecord("git-commit", timestamp, locator, summary),
      type: "git-commit",
      timestamp,
      locator,
      summary,
      ownership: attributed ? "attributed" : "unverified",
      verification: attributed ? "fact" : "unverified",
    });
  }
  return records;
}

function forgeRepository(remote: string): { forge: "gh" | "glab"; slug: string } | null {
  const match = /(?:github\.com|gitlab\.com)[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/iu.exec(remote.trim());
  if (!match?.[1]) return null;
  return { forge: /gitlab\.com/iu.test(remote) ? "glab" : "gh", slug: match[1] };
}

async function collectRemote(repo: string, options: CollectEvidenceOptions, run: CommandRunner, home: string, gaps: string[]): Promise<EvidenceRecordV2[]> {
  const remote = await git(run, repo, ["config", "--get", "remote.origin.url"]);
  const parsed = remote.code === 0 ? forgeRepository(remote.stdout) : null;
  if (!parsed) return [];
  const version = await run(parsed.forge, ["--version"]);
  if (version.code !== 0) {
    gaps.push(`${parsed.forge} CLI unavailable for ${basename(repo)}`);
    return [];
  }
  const auth = await run(parsed.forge, ["auth", "status"]);
  if (auth.code !== 0) {
    gaps.push(`${parsed.forge} is not already authenticated for ${basename(repo)}`);
    return [];
  }
  const result = parsed.forge === "gh"
    ? await run("gh", ["pr", "list", "--repo", parsed.slug, "--state", "all", "--limit", "20", "--json", "number,title,url,updatedAt"])
    : await run("glab", ["mr", "list", "--repo", parsed.slug, "--all", "--per-page", "20", "--output", "json"]);
  if (result.code !== 0) {
    gaps.push(`${parsed.forge} read-only query failed for ${basename(repo)}`);
    return [];
  }
  let items: unknown;
  try { items = JSON.parse(result.stdout); } catch { gaps.push(`${parsed.forge} returned malformed JSON for ${basename(repo)}`); return []; }
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): EvidenceRecordV2[] => {
    if (typeof item !== "object" || item === null) return [];
    const value = item as Record<string, unknown>;
    const timestamp = String(value.updatedAt ?? value.updated_at ?? "");
    const number = String(value.number ?? value.iid ?? "");
    const summary = clean(String(value.title ?? ""), home);
    const timestampMs = Date.parse(timestamp);
    if (!timestamp || !number || !Number.isFinite(timestampMs) || timestampMs < options.window.startMs || timestampMs > options.window.endMs) return [];
    const locator = `${parsed.slug}#${number}`;
    return [{
      ...stableRecord("forge-item", timestamp, locator, summary),
      type: "forge-item",
      timestamp,
      locator,
      summary,
      ownership: "unverified",
      verification: "fact",
    }];
  });
}

export async function collectEvidenceBundle(options: CollectEvidenceOptions): Promise<EvidenceBundleV2> {
  const run = options.run ?? spawnCommand;
  const home = options.home ?? process.env.HOME ?? homedir();
  const gaps: string[] = [];
  const records: EvidenceRecordV2[] = [];
  for (const session of options.sessions ?? []) {
    if (!session.sessionId || !session.lastEventAt) continue;
    const locator = `${session.platform ?? "session"}:${session.sessionId}`;
    const summary = `session in ${session.cwd ? basename(session.cwd) : "unknown project"}`;
    records.push({
      ...stableRecord("transcript-session", session.lastEventAt, locator, summary),
      type: "transcript-session",
      timestamp: session.lastEventAt,
      locator,
      summary,
      ownership: "unverified",
      verification: "fact",
    });
  }
  if (options.skipGit) {
    return {
      schema: "EvidenceBundleV2",
      window: { label: options.window.label, start: new Date(options.window.startMs).toISOString(), end: new Date(options.window.endMs).toISOString() },
      sources: { transcript: { status: "collected", sessions: options.sessions?.length ?? 0 }, git: { status: "skipped", repositories: 0 }, remote: { status: "skipped", items: 0 } },
      records,
      dataGaps: gaps,
    };
  }
  const repositories = await resolveRepositories(options, run, gaps);
  for (const repo of repositories) records.push(...await collectCommits(repo, options, run, home, gaps));
  let remoteStatus: EvidenceBundleV2["sources"]["remote"]["status"] = options.skipRemote ? "skipped" : "collected";
  const beforeRemote = records.length;
  if (!options.skipRemote) {
    for (const repo of repositories) records.push(...await collectRemote(repo, options, run, home, gaps));
    if (gaps.some((gap) => /(?:CLI unavailable|not already authenticated|query failed)/u.test(gap))) remoteStatus = "unavailable";
  }
  records.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));
  return {
    schema: "EvidenceBundleV2",
    window: { label: options.window.label, start: new Date(options.window.startMs).toISOString(), end: new Date(options.window.endMs).toISOString() },
    sources: {
      transcript: { status: "collected", sessions: options.sessions?.length ?? 0 },
      git: { status: "collected", repositories: repositories.length },
      remote: { status: remoteStatus, items: records.length - beforeRemote },
    },
    records,
    dataGaps: [...new Set(gaps)].sort(),
  };
}

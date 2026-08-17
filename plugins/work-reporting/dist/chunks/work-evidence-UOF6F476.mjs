// harness-source-hash: sha256:260e491d8369ec89a3a058ab4b294ee5f3647ef8edb2e23c18fca630ff5fec27
import {
  sanitizeSnippet
} from "./chunk-7V3B2FH3.mjs";

// plugins/work-reporting/src/lib/work-evidence.ts
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stableRecord(type, timestamp, locator, summary) {
  const value = `${type}${timestamp}${locator}${summary}`;
  const hash = digest(value);
  return { id: `E-${hash.slice(0, 12)}`, digest: hash };
}
var spawnCommand = (command, args, cwd) => new Promise((resolvePromise) => {
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("error", (error) => resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}` }));
  child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
});
function boundedInteger(value, fallback, maximum, label) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`${label} expects an integer from 1 to ${maximum}`);
  return result;
}
function clean(value, home) {
  return sanitizeSnippet(value, home);
}
async function git(run, repo, args) {
  return run("git", ["-C", repo, ...args]);
}
async function resolveRepositories(options, run, gaps) {
  const requested = [
    ...(options.sessions ?? []).map((session) => session.cwd).filter((cwd) => Boolean(cwd)),
    ...options.repos ?? []
  ];
  const roots = /* @__PURE__ */ new Set();
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
async function collectCommits(repo, options, run, home, gaps) {
  const [nameResult, emailResult] = await Promise.all([
    git(run, repo, ["config", "--get", "user.name"]),
    git(run, repo, ["config", "--get", "user.email"])
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
    "--format=%H%x1f%cI%x1f%an%x1f%ae%x1f%s"
  ]);
  if (result.code !== 0) {
    gaps.push(`Git log unavailable for ${basename(repo)}`);
    return [];
  }
  const records = [];
  for (const line of result.stdout.split(/\r?\n/u).filter(Boolean)) {
    const [hash = "", timestamp = "", authorName = "", authorEmail = "", ...subjectParts] = line.split("");
    if (!hash || !timestamp) continue;
    const summary = clean(subjectParts.join(""), home);
    const locator = `${basename(repo)}@${hash.slice(0, 12)}`;
    const attributed = Boolean(
      configuredEmail && authorEmail.toLowerCase() === configuredEmail || configuredName && authorName.toLowerCase() === configuredName
    );
    records.push({
      ...stableRecord("git-commit", timestamp, locator, summary),
      type: "git-commit",
      timestamp,
      locator,
      summary,
      ownership: attributed ? "attributed" : "unverified",
      verification: attributed ? "fact" : "unverified"
    });
  }
  return records;
}
function forgeRepository(remote) {
  const match = /(?:github\.com|gitlab\.com)[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/iu.exec(remote.trim());
  if (!match?.[1]) return null;
  return { forge: /gitlab\.com/iu.test(remote) ? "glab" : "gh", slug: match[1] };
}
async function collectRemote(repo, options, run, home, gaps) {
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
  const result = parsed.forge === "gh" ? await run("gh", ["pr", "list", "--repo", parsed.slug, "--state", "all", "--limit", "20", "--json", "number,title,url,updatedAt"]) : await run("glab", ["mr", "list", "--repo", parsed.slug, "--all", "--per-page", "20", "--output", "json"]);
  if (result.code !== 0) {
    gaps.push(`${parsed.forge} read-only query failed for ${basename(repo)}`);
    return [];
  }
  let items;
  try {
    items = JSON.parse(result.stdout);
  } catch {
    gaps.push(`${parsed.forge} returned malformed JSON for ${basename(repo)}`);
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const value = item;
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
      verification: "fact"
    }];
  });
}
async function collectEvidenceBundle(options) {
  const run = options.run ?? spawnCommand;
  const home = options.home ?? process.env.HOME ?? homedir();
  const gaps = [];
  const records = [];
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
      verification: "fact"
    });
  }
  if (options.skipGit) {
    return {
      schema: "EvidenceBundleV2",
      window: { label: options.window.label, start: new Date(options.window.startMs).toISOString(), end: new Date(options.window.endMs).toISOString() },
      sources: { transcript: { status: "collected", sessions: options.sessions?.length ?? 0 }, git: { status: "skipped", repositories: 0 }, remote: { status: "skipped", items: 0 } },
      records,
      dataGaps: gaps
    };
  }
  const repositories = await resolveRepositories(options, run, gaps);
  for (const repo of repositories) records.push(...await collectCommits(repo, options, run, home, gaps));
  let remoteStatus = options.skipRemote ? "skipped" : "collected";
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
      remote: { status: remoteStatus, items: records.length - beforeRemote }
    },
    records,
    dataGaps: [...new Set(gaps)].sort()
  };
}
export {
  collectEvidenceBundle,
  spawnCommand
};

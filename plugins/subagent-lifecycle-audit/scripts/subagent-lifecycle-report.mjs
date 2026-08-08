#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readSessionRows, trailPaths } from "./lib/jsonl-trail.mjs";
import { resolveRepoRoot, sanitizeSessionKey } from "./lib/paths.mjs";

function parseArgs(argv) {
  const options = { cwd: process.cwd(), session: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--cwd" || arg === "--session") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function summarizeSession(sessionKey, rows) {
  const agents = [];
  const anomalies = [];
  const openByAgent = new Map();

  function stackFor(agentId) {
    if (!openByAgent.has(agentId)) openByAgent.set(agentId, []);
    return openByAgent.get(agentId);
  }

  for (const row of rows) {
    if (row?.schema !== "subagent-lifecycle/v1") {
      anomalies.push({ kind: "invalid-row" });
      continue;
    }
    if (!row.agent_id) {
      anomalies.push({
        kind: "missing-agent-id",
        event: row.event,
        observed_at: row.observed_at,
      });
      continue;
    }
    if (row.event === "started") {
      const agent = {
        agent_id: row.agent_id,
        agent_type: row.agent_type,
        parent_agent_id: row.parent_agent_id,
        state: "open",
        started_at: row.started_at,
        ended_at: null,
        duration_ms: null,
      };
      agents.push(agent);
      stackFor(row.agent_id).push(agent);
      if (row.correlation === "duplicate-start") {
        anomalies.push({
          kind: "duplicate-start",
          agent_id: row.agent_id,
          observed_at: row.observed_at,
        });
      }
      continue;
    }
    if (row.event !== "stopped") continue;
    const stack = stackFor(row.agent_id);
    const start = row.correlation === "matched" ? stack.pop() : null;
    if (start) {
      start.state = "stopped";
      start.ended_at = row.ended_at;
      start.duration_ms = row.duration_ms;
      continue;
    }
    agents.push({
      agent_id: row.agent_id,
      agent_type: row.agent_type,
      parent_agent_id: row.parent_agent_id,
      state: "orphan-stop",
      started_at: null,
      ended_at: row.ended_at,
      duration_ms: null,
    });
    anomalies.push({
      kind: "orphan-stop",
      agent_id: row.agent_id,
      observed_at: row.observed_at,
    });
  }

  return {
    session_key: sessionKey,
    counts: {
      started: rows.filter((row) => row?.event === "started").length,
      stopped: rows.filter((row) => row?.event === "stopped").length,
      matched: rows.filter((row) => row?.correlation === "matched").length,
      open: agents.filter((agent) => agent.state === "open").length,
      orphan_stop: agents.filter((agent) => agent.state === "orphan-stop").length,
      missing_agent_id: anomalies.filter((item) => item.kind === "missing-agent-id").length,
      duplicate_start: anomalies.filter((item) => item.kind === "duplicate-start").length,
    },
    agents,
    anomalies,
  };
}

async function sessionKeys(paths, requestedSession, cwd) {
  if (requestedSession) return [sanitizeSessionKey(requestedSession, cwd)];
  try {
    const entries = await readdir(paths.sessionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => entry.name.slice(0, -".jsonl".length))
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function buildReport(options, now = new Date()) {
  const cwd = resolve(options.cwd);
  const repoRoot = resolveRepoRoot(cwd);
  const basePaths = trailPaths(repoRoot, "unused");
  const keys = await sessionKeys(basePaths, options.session, cwd);
  const sessions = [];
  for (const key of keys) {
    const paths = trailPaths(repoRoot, key);
    const rows = await readSessionRows(paths.sessionPath);
    if (rows.length > 0) sessions.push(summarizeSession(key, rows));
  }
  return {
    schema: "subagent-lifecycle-report/v1",
    generated_at: now.toISOString(),
    sessions,
  };
}

function humanReport(report) {
  if (report.sessions.length === 0) return "No subagent lifecycle sessions found.\n";
  const lines = [];
  for (const session of report.sessions) {
    const counts = session.counts;
    lines.push(
      `${session.session_key}: started=${counts.started} stopped=${counts.stopped} open=${counts.open} orphan-stop=${counts.orphan_stop}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildReport(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(humanReport(report));
  }
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[subagent-lifecycle-report] ${error?.message ?? error}\n`);
    process.exitCode = 2;
  });
}

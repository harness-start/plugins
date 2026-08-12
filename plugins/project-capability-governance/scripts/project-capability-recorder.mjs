#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { ensureCapabilityWorkspace } from "./lib/proposals.mjs";
import { updateWorkflowState } from "./lib/workflow-state.mjs";

const BATCH_ID = /^[a-z0-9][a-z0-9-]{2,63}$/u;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) options[value.slice(2)] = true;
    else {
      options[value.slice(2)] = next;
      index += 1;
    }
  }
  return options;
}

function projectRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

function sessionId(options) {
  return String(
    options.session
      ?? process.env.AI_EXPERTS_SESSION_ID
      ?? process.env.CODEX_THREAD_ID
      ?? process.env.CLAUDE_SESSION_ID
      ?? "",
  ).trim();
}

async function reserve(options) {
  const batchId = String(options.batch ?? "").trim();
  const request = String(options.request ?? "").trim();
  const session = sessionId(options);
  const cwd = resolve(String(options.cwd ?? process.cwd()));
  if (!BATCH_ID.test(batchId)) throw new Error("--batch must be a path-safe lowercase id");
  if (!request || request.length > 4000) throw new Error("--request must contain a standalone recorder request of at most 4000 characters");
  if (!session || session === "hook") throw new Error("--session or a platform session environment variable is required");
  const root = projectRoot(cwd);
  const event = { cwd: root, session_id: session };
  const workflowEnvironment = options["data-root"]
    ? { ...process.env, PLUGIN_DATA: resolve(String(options["data-root"])) }
    : process.env;
  await updateWorkflowState(event, root, (state) => {
    const existing = state.reservations[batchId];
    if (existing?.epoch === state.epoch && existing.request === request && state.recorderDispatches === 1) return;
    if (state.recorderDispatches >= 1) {
      throw new Error("one recorder is already reserved for the current prompt epoch");
    }
    state.recorderDispatches = 1;
    state.reservations = { [batchId]: { epoch: state.epoch, request } };
  }, workflowEnvironment);
  await ensureCapabilityWorkspace(root);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    batchId,
    marker: `PROJECT_CAPABILITY_RECORDER ${batchId}`,
  })}\n`);
}

async function main() {
  const command = process.argv[2];
  const options = parseArgs(process.argv.slice(3));
  if (command === "reserve") await reserve(options);
  else throw new Error(`unknown command: ${command ?? "missing"}`);
}

main().catch((error) => {
  process.stderr.write(`[project-capability-recorder] ${error?.message ?? String(error)}\n`);
  process.exitCode = 2;
});

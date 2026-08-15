import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { cwd, sessionId } from "./hook-io.js";
import { findActiveWorkflow, isActivePhase, readWorkflowFile, workflowPath } from "./workflow-fs.js";

const TTL_MS = 24 * 60 * 60 * 1000;

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export const STATE_DIR_RELATIVE = ".research/state";

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignore = join(dirname(directory), ".gitignore");
  try {
    readFileSync(ignore, "utf8");
  } catch {
    writeFileSync(ignore, "state/\n", { encoding: "utf8", mode: 0o600 });
  }
}

function directory(event) {
  const session = sessionId(event) || "default";
  const target = join(resolve(cwd(event)), STATE_DIR_RELATIVE, "hook-events", hash(session));
  return target;
}

export function appendStateEvent(event, type, payload = {}) {
  const target = directory(event);
  if (!target) return false;
  try {
    ensureStateDir(join(resolve(cwd(event)), STATE_DIR_RELATIVE));
    mkdirSync(target, { recursive: true, mode: 0o700 });
    const stamp = `${String(Date.now()).padStart(13, "0")}-${process.hrtime.bigint()}-${process.pid}-${randomBytes(5).toString("hex")}`;
    writeFileSync(join(target, `${stamp}.json`), `${JSON.stringify({ version: 1, type, at: Date.now(), payload })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export function readState(event) {
  const workspace = resolve(cwd(event));
  const workflow = findActiveWorkflow(workspace);
  const state = {
    promptEpoch: 0,
    revision: 0,
    active: false,
    aborted: false,
    abortedRunId: null,
    completed: false,
    completedRunId: null,
    seal: null,
    runId: workflow?.run_id ?? null,
    receipts: [],
    workflow,
    workflowPhase: workflow?.phase ?? null,
  };

  const target = directory(event);
  if (target) {
    let files;
    try {
      files = readdirSync(target).filter((name) => name.endsWith(".json")).sort();
    } catch {
      files = [];
    }
    for (const file of files) {
      let item;
      try {
        item = JSON.parse(readFileSync(join(target, file), "utf8"));
      } catch {
        continue;
      }
      if (Date.now() - Number(item.at ?? 0) > TTL_MS) {
        try {
          unlinkSync(join(target, file));
        } catch {}
        continue;
      }
      if (item.type === "prompt") {
        state.promptEpoch += 1;
        if (item.payload.abort === true) {
          state.aborted = true;
          state.abortedRunId = item.payload.runId ?? state.runId;
          state.runId = item.payload.runId ?? state.runId;
        }
      } else if (item.type === "mutation") {
        state.revision += 1;
        state.seal = null;
      } else if (item.type === "receipt") {
        state.receipts.push(item.payload);
        if (item.payload.tool === "research_begin") {
          state.runId = item.payload.runId ?? state.runId;
          state.seal = null;
          state.aborted = false;
          state.completed = false;
        }
        if (item.payload.tool === "research_seal" && (!state.runId || item.payload.runId === state.runId)) state.seal = item.payload;
      } else if (item.type === "complete") {
        if (!item.payload.runId || !state.runId || item.payload.runId === state.runId) {
          state.completed = true;
          state.completedRunId = item.payload.runId ?? state.runId;
          state.runId = item.payload.runId ?? state.runId;
        }
      }
    }
  }

  const runWorkflow = state.runId ? readWorkflowFile(workflowPath(workspace, state.runId)) : null;
  if (state.aborted && runWorkflow && runWorkflow.phase !== "aborted") state.aborted = false;
  if (state.completed && runWorkflow && runWorkflow.phase !== "complete") state.completed = false;
  if (workflow && state.aborted && state.abortedRunId !== workflow.run_id) state.aborted = false;
  if (workflow && state.completed && state.completedRunId !== workflow.run_id) state.completed = false;

  if (state.aborted || state.completed) {
    state.active = false;
    return state;
  }

  if (workflow && isActivePhase(workflow.phase)) {
    state.active = true;
    state.runId = workflow.run_id;
    if (state.seal?.runId !== state.runId) state.seal = null;
    // Seal authority remains same-session MCP PostToolUse receipts (freshness after mutations).
    // workflow.json records phase for activation and outbound gates only.
  } else if (state.receipts.some((item) => item.tool === "research_begin")) {
    // MCP begin observed but workflow missing/unreadable: gate until a validated Stop or exact abort.
    const begun = [...state.receipts].reverse().find((item) => item.tool === "research_begin");
    if (begun && !state.aborted && !state.completed) {
      state.active = true;
      state.runId = begun.runId ?? state.runId;
      if (state.seal?.runId !== state.runId) state.seal = null;
    }
  }

  return state;
}

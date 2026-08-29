import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";

import { cwd, sessionId } from "./hook-io.js";
import { findActiveWorkflow, isActivePhase, readWorkflowFile, workflowPath, type ResearchWorkflow } from "./workflow-fs.js";

const TTL_MS = 24 * 60 * 60 * 1000;

export type StatePayload = {
  abort?: boolean;
  runId?: string | null;
  tool?: string;
  seal?: string | null;
  promptEpoch?: number;
  revision?: number;
  eventId?: string | null;
  observedAt?: number;
  conservative?: boolean;
};

export type ResearchHookState = {
  promptEpoch: number;
  revision: number;
  active: boolean;
  aborted: boolean;
  abortedRunId: string | null;
  completed: boolean;
  completedRunId: string | null;
  seal: StatePayload | null;
  runId: string | null;
  receipts: StatePayload[];
  workflow: ResearchWorkflow | null;
  workflowPhase: string | null;
};

function hash(value: string): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

export const STATE_DIR_RELATIVE = ".research/state";

function ensureStateDir(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(dirname(directory));
}

function directory(event: HookEvent): string {
  const session = sessionId(event) || "default";
  const target = join(resolve(cwd(event)), STATE_DIR_RELATIVE, "hook-events", hash(session));
  return target;
}

function payloadFromUnknown(value: unknown): StatePayload {
  if (!isRecord(value)) return {};
  const payload: StatePayload = {};
  if (typeof value.abort === "boolean") payload.abort = value.abort;
  if (typeof value.runId === "string" || value.runId === null) payload.runId = value.runId;
  if (typeof value.tool === "string") payload.tool = value.tool;
  if (typeof value.seal === "string" || value.seal === null) payload.seal = value.seal;
  if (typeof value.promptEpoch === "number") payload.promptEpoch = value.promptEpoch;
  if (typeof value.revision === "number") payload.revision = value.revision;
  if (typeof value.eventId === "string" || value.eventId === null) payload.eventId = value.eventId;
  if (typeof value.observedAt === "number") payload.observedAt = value.observedAt;
  if (typeof value.conservative === "boolean") payload.conservative = value.conservative;
  return payload;
}

export function appendStateEvent(event: HookEvent, type: string, payload: Record<string, unknown> = {}): boolean {
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

export function readState(event: HookEvent): ResearchHookState {
  const workspace = resolve(cwd(event));
  const workflow = findActiveWorkflow(workspace);
  const state: ResearchHookState = {
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
    let files: string[];
    try {
      files = readdirSync(target).filter((name) => name.endsWith(".json")).sort();
    } catch {
      files = [];
    }
    for (const file of files) {
      let item: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(readFileSync(join(target, file), "utf8"));
        if (!isRecord(parsed)) continue;
        item = parsed;
      } catch {
        continue;
      }
      if (Date.now() - Number(item.at ?? 0) > TTL_MS) {
        try {
          unlinkSync(join(target, file));
        } catch {}
        continue;
      }
      const payload = payloadFromUnknown(item.payload);
      if (item.type === "prompt") {
        state.promptEpoch += 1;
        if (payload.abort === true) {
          state.aborted = true;
          state.abortedRunId = payload.runId ?? state.runId;
          state.runId = payload.runId ?? state.runId;
        }
      } else if (item.type === "mutation") {
        state.revision += 1;
        state.seal = null;
      } else if (item.type === "receipt") {
        state.receipts.push(payload);
        if (payload.tool === "research_begin") {
          state.runId = payload.runId ?? state.runId;
          state.seal = null;
          state.aborted = false;
          state.completed = false;
        }
        if (payload.tool === "research_seal" && (!state.runId || payload.runId === state.runId)) state.seal = payload;
      } else if (item.type === "complete") {
        if (!payload.runId || !state.runId || payload.runId === state.runId) {
          state.completed = true;
          state.completedRunId = payload.runId ?? state.runId;
          state.runId = payload.runId ?? state.runId;
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

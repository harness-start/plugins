import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { cwd, sessionId } from "./hook-io.mjs";
import { findActiveWorkflow, isActivePhase } from "./workflow-fs.mjs";

const TTL_MS = 24 * 60 * 60 * 1000;

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function directory(event) {
  const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? process.env.RESEARCH_PLUGIN_DATA;
  const session = sessionId(event);
  if (!data || !session) return null;
  return join(resolve(data), "research-provenance-guard", "hook-events", hash(`${session}\0${resolve(cwd(event))}`));
}

export function appendStateEvent(event, type, payload = {}) {
  const target = directory(event);
  if (!target) return false;
  try {
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
        state.aborted = item.payload.abort === true;
      } else if (item.type === "mutation") {
        state.revision += 1;
        state.seal = null;
      } else if (item.type === "receipt") {
        state.receipts.push(item.payload);
        if (item.payload.tool === "research_begin") {
          state.runId = item.payload.runId ?? state.runId;
        }
        if (item.payload.tool === "research_seal") state.seal = item.payload;
      } else if (item.type === "complete") {
        // completion recorded; workflow file remains source of truth for phase
      }
    }
  }

  if (state.aborted) {
    state.active = false;
    return state;
  }

  if (workflow && isActivePhase(workflow.phase)) {
    state.active = true;
    state.runId = workflow.run_id;
    // Seal authority remains same-session MCP PostToolUse receipts (freshness after mutations).
    // workflow.json records phase for activation and outbound gates only.
  } else if (state.receipts.some((item) => item.tool === "research_begin")) {
    // MCP begin observed but workflow missing/unreadable: still gate until seal or abort
    const begun = [...state.receipts].reverse().find((item) => item.tool === "research_begin");
    const sealed = state.receipts.some((item) => item.tool === "research_seal" && item.runId === (begun?.runId ?? item.runId));
    if (begun && !state.aborted && !sealed) {
      state.active = true;
      state.runId = begun.runId ?? state.runId;
    }
  }

  return state;
}

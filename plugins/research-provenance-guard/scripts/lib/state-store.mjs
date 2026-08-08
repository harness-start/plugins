import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { cwd, sessionId } from "./hook-io.mjs";

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
  } catch { return false; }
}

export function readState(event) {
  const state = { promptEpoch: 0, revision: 0, active: false, aborted: false, seal: null, runId: null, receipts: [] };
  const target = directory(event);
  if (!target) return state;
  let files;
  try { files = readdirSync(target).filter((name) => name.endsWith(".json")).sort(); } catch { return state; }
  for (const file of files) {
    let item;
    try { item = JSON.parse(readFileSync(join(target, file), "utf8")); } catch { continue; }
    if (Date.now() - Number(item.at ?? 0) > TTL_MS) {
      try { unlinkSync(join(target, file)); } catch {}
      continue;
    }
    if (item.type === "prompt") {
      state.promptEpoch += 1;
      state.aborted = item.payload.abort === true;
      if (item.payload.activate === true) state.active = true;
      if (state.aborted) state.active = false;
    } else if (item.type === "activate") {
      state.active = true;
      state.aborted = false;
      if (item.payload.runId) state.runId = item.payload.runId;
    } else if (item.type === "mutation") {
      state.revision += 1;
      state.seal = null;
    } else if (item.type === "receipt") {
      state.receipts.push(item.payload);
      if (item.payload.tool === "research_begin") {
        state.active = true;
        state.runId = item.payload.runId ?? state.runId;
      }
      if (item.payload.tool === "research_seal") state.seal = item.payload;
    } else if (item.type === "complete") state.active = false;
  }
  return state;
}

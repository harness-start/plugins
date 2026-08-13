import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";

const VERSION = 1;

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function emptyState() {
  return {
    version: VERSION,
    phase: "idle",
    kind: null,
    answerCount: 0,
    candidateSha256: null,
    candidatePath: null,
    reportSha256: null,
    target: null,
    operation: null,
    criticApproval: null,
    updatedAt: 0,
  };
}

function dataRoot(env) {
  return resolve(env.WORK_REPORT_INSIGHTS_DATA ?? env.PLUGIN_DATA ?? env.CLAUDE_PLUGIN_DATA ?? join(env.HOME || homedir(), ".ai-experts", ".work-report-insights"));
}

export function statePath(event, env = process.env) {
  const key = `${extractSessionId(event)}\0${resolve(extractCwd(event))}`;
  return join(dataRoot(env), "state", `${digest(key)}.json`);
}

export async function readState(event, env = process.env) {
  try {
    const parsed = JSON.parse(await readFile(statePath(event, env), "utf8"));
    if (parsed?.version !== VERSION) return emptyState();
    return { ...emptyState(), ...parsed, version: VERSION };
  } catch {
    return emptyState();
  }
}

export async function writeState(event, state, env = process.env) {
  const path = statePath(event, env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
  const next = { ...emptyState(), ...state, version: VERSION, updatedAt: Date.now() };
  try {
    await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return next;
}

export async function updateState(event, updater, env = process.env) {
  const current = await readState(event, env);
  const next = await updater({ ...current });
  return writeState(event, next ?? current, env);
}

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";

import { extractCwd, extractSessionId } from "./hook-io.js";

const VERSION = 2;
export const STATE_DIR_RELATIVE = ".work-reporting/.state";

export type ReportHookState = {
  version: number;
  phase: string;
  kind: string | null;
  candidateSha256: string | null;
  candidatePath: string | null;
  reportSha256: string | null;
  target: string | null;
  operation: string | null;
  evidencePath: string | null;
  contractDigest: string | null;
  evidenceDigest: string | null;
  ackToken: string | null;
  acknowledgementDigest: string | null;
  lastError: string | null;
  updatedAt: number;
};

function digest(value: string): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function emptyState(): ReportHookState {
  return {
    version: VERSION,
    phase: "idle",
    kind: null,
    candidateSha256: null,
    candidatePath: null,
    reportSha256: null,
    target: null,
    operation: null,
    evidencePath: null,
    contractDigest: null,
    evidenceDigest: null,
    ackToken: null,
    acknowledgementDigest: null,
    lastError: null,
    updatedAt: 0,
  };
}

function dataRoot(event: HookEvent, env: NodeJS.ProcessEnv = process.env): string {
  if (env.WORK_REPORT_INSIGHTS_DATA) return resolve(env.WORK_REPORT_INSIGHTS_DATA);
  return join(resolve(extractCwd(event)), STATE_DIR_RELATIVE);
}

export function statePath(event: HookEvent, env: NodeJS.ProcessEnv = process.env): string {
  const session = extractSessionId(event) || "default";
  return join(dataRoot(event, env), `${digest(session)}.json`);
}

export async function readState(event: HookEvent, env: NodeJS.ProcessEnv = process.env): Promise<ReportHookState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath(event, env), "utf8"));
    if (!isRecord(parsed) || parsed.version !== VERSION) return emptyState();
    return { ...emptyState(), ...parsed, version: VERSION };
  } catch {
    return emptyState();
  }
}

export async function writeState(
  event: HookEvent,
  state: Partial<ReportHookState>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReportHookState> {
  const path = statePath(event, env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const storageRoot = env.WORK_REPORT_INSIGHTS_DATA
    ? resolve(env.WORK_REPORT_INSIGHTS_DATA)
    : join(resolve(extractCwd(event)), ".work-reporting");
  ensurePluginWorkdirGitignore(storageRoot);
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

export async function updateState(
  event: HookEvent,
  updater: (state: ReportHookState) => ReportHookState | Partial<ReportHookState> | null | undefined | Promise<ReportHookState | Partial<ReportHookState> | null | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReportHookState> {
  const current = await readState(event, env);
  const next = await updater({ ...current });
  return writeState(event, next ?? current, env);
}

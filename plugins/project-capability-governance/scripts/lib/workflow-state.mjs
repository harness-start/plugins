import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { extractSessionId } from "./hook-io.mjs";

function emptyState() {
  return {
    version: 1,
    epoch: 0,
    recorderDispatches: 0,
    reservations: {},
    bindings: {},
  };
}

function dataRoot(env) {
  return resolve(env.PLUGIN_DATA ?? env.CLAUDE_PLUGIN_DATA ?? join(tmpdir(), "project-capability-governance"));
}

function statePath(event, projectRoot, env) {
  const key = createHash("sha256")
    .update(`${resolve(projectRoot)}\0${extractSessionId(event)}`)
    .digest("hex");
  return join(dataRoot(env), "sessions", `${key}.json`);
}

async function read(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed?.version === 1 ? { ...emptyState(), ...parsed } : emptyState();
  } catch {
    return emptyState();
  }
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function withLock(path, operation) {
  const lockPath = `${path}.lock`;
  await mkdir(join(path, ".."), { recursive: true });
  let handle = null;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt === 24) throw error;
      await wait(10);
    }
  }
  try {
    return await operation();
  } finally {
    await handle?.close();
    await unlink(lockPath).catch(() => {});
  }
}

export async function readWorkflowState(event, projectRoot, env = process.env) {
  return read(statePath(event, projectRoot, env));
}

export async function updateWorkflowState(event, projectRoot, mutate, env = process.env) {
  const path = statePath(event, projectRoot, env);
  return withLock(path, async () => {
    const state = await read(path);
    const result = await mutate(state);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
    return result;
  });
}

export { emptyState };

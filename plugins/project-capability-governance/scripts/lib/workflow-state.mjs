import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { extractSessionId } from "./hook-io.mjs";

export const STATE_DIR_RELATIVE = ".project-capabilities/.state";

function emptyState() {
  return {
    version: 1,
    epoch: 0,
    recorderDispatches: 0,
    reservations: {},
    bindings: {},
  };
}

function dataRoot(projectRoot) {
  const directory = join(resolve(projectRoot), STATE_DIR_RELATIVE);
  return directory;
}

function ensureStateDir(directory) {
  if (!existsSync(join(directory, ".gitignore"))) {
    writeFileSync(join(directory, ".gitignore"), "*\n", { encoding: "utf8", mode: 0o600 });
  }
}

function statePath(event, projectRoot) {
  const key = createHash("sha256")
    .update(String(extractSessionId(event) || "default"))
    .digest("hex");
  return join(dataRoot(projectRoot), `${key}.json`);
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

export async function readWorkflowState(event, projectRoot) {
  return read(statePath(event, projectRoot));
}

export async function updateWorkflowState(event, projectRoot, mutate) {
  const path = statePath(event, projectRoot);
  return withLock(path, async () => {
    const state = await read(path);
    const result = await mutate(state);
    const temporary = `${path}.${process.pid}.tmp`;
    await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
    ensureStateDir(join(path, ".."));
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
    return result;
  });
}

export { emptyState };

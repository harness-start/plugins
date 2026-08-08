import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;
const PLUGIN_NAME = "subagent-workflow-guard";

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function emptyState(sessionId, cwd) {
  return {
    version: VERSION,
    sessionId,
    cwd: resolve(cwd),
    run: null,
    applications: {},
    bindings: {},
    updatedAt: 0,
  };
}

export function dataRoot(host, cwd) {
  const configured = host === "claude"
    ? process.env.CLAUDE_PLUGIN_DATA
    : process.env.PLUGIN_DATA;
  if (!configured) {
    const variable = host === "claude" ? "CLAUDE_PLUGIN_DATA" : "PLUGIN_DATA";
    throw new Error(`${variable} is unavailable; durable workflow enforcement cannot start`);
  }
  return join(resolve(configured), PLUGIN_NAME, host);
}

export function statePath({ host, sessionId, cwd }) {
  const key = digest(`${sessionId}\0${resolve(cwd)}`);
  return join(dataRoot(host, cwd), "sessions", `${key}.json`);
}

export function applicationPath({ host, sessionId, cwd, applicationId }) {
  const key = digest(`${sessionId}\0${resolve(cwd)}`);
  return join(dataRoot(host, cwd), "applications", key, `${applicationId}.json`);
}

async function readStateFile(path, sessionId, cwd) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const expectedCwd = resolve(cwd);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        parsed.version !== VERSION || parsed.sessionId !== sessionId ||
        typeof parsed.cwd !== "string" || resolve(parsed.cwd) !== expectedCwd ||
        !parsed.applications || typeof parsed.applications !== "object" || Array.isArray(parsed.applications) ||
        !parsed.bindings || typeof parsed.bindings !== "object" || Array.isArray(parsed.bindings)) {
      throw new Error("workflow state schema or identity is invalid");
    }
    if (parsed.run !== null && (!parsed.run || typeof parsed.run !== "object" ||
        !/^[a-zA-Z0-9._-]{1,96}$/u.test(parsed.run.id) ||
        !["open", "closed"].includes(parsed.run.phase))) {
      throw new Error("workflow run state is invalid");
    }
    for (const [id, application] of Object.entries(parsed.applications)) {
      if (!application || typeof application !== "object" || application.id !== id ||
          typeof application.runId !== "string" || !["prepared", "reserved", "bound", "delivered"].includes(application.state)) {
        throw new Error(`workflow application state is invalid: ${id}`);
      }
    }
    for (const [agentId, applicationId] of Object.entries(parsed.bindings)) {
      if (!agentId || typeof applicationId !== "string" || !parsed.applications[applicationId]) {
        throw new Error(`workflow binding state is invalid: ${agentId}`);
      }
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState(sessionId, cwd);
    throw error;
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}

async function withLock(path, operation) {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  let lock;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt === 39) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  try {
    return await operation();
  } finally {
    await lock?.close();
    await rm(lockPath, { force: true });
  }
}

export async function readState(context) {
  return readStateFile(statePath(context), context.sessionId, context.cwd);
}

export async function updateState(context, updater) {
  const path = statePath(context);
  return withLock(path, async () => {
    const state = await readStateFile(path, context.sessionId, context.cwd);
    const result = await updater(state);
    state.updatedAt = Date.now();
    await atomicWrite(path, state);
    return { state, result };
  });
}

export async function writeApplicationArtifact(context, application) {
  const path = applicationPath({ ...context, applicationId: application.id });
  await atomicWrite(path, application);
  return path;
}

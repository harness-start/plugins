import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const NAME = "subagent-workflow-guard";

async function root(cwd, host, sessionId) {
  if (!sessionId) throw new Error("mailbox session is required");
  const sessionKey = createHash("sha256").update(sessionId).digest("hex");
  const { stdout } = await execFileAsync("git", ["rev-parse", "--git-path", `ai-experts/${NAME}/${host}/${sessionKey}`], { cwd });
  const value = stdout.trim();
  if (!value) throw new Error("git did not return a workflow mailbox path");
  return resolve(cwd, value);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}

export async function readMailboxRun(context) {
  return readJson(join(await root(context.cwd, context.host, context.sessionId), "run.json"));
}

export async function writeMailboxRun(context, request) {
  await atomicWrite(join(await root(context.cwd, context.host, context.sessionId), "run.json"), request);
}

export async function readMailboxApplication(context, applicationId) {
  return readJson(join(await root(context.cwd, context.host, context.sessionId), "applications", `${applicationId}.json`));
}

export async function writeMailboxApplication(context, application) {
  await atomicWrite(join(await root(context.cwd, context.host, context.sessionId), "applications", `${application.id}.json`), {
    version: 1,
    sessionId: context.sessionId,
    runId: application.runId,
    application,
  });
}

export async function readMailboxClose(context) {
  return readJson(join(await root(context.cwd, context.host, context.sessionId), "close.json"));
}

export async function writeMailboxClose(context, request) {
  await atomicWrite(join(await root(context.cwd, context.host, context.sessionId), "close.json"), request);
}

export async function removeMailboxClose(context) {
  await rm(join(await root(context.cwd, context.host, context.sessionId), "close.json"), { force: true });
}

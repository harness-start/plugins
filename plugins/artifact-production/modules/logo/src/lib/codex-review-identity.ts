import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_FIRST_RECORD_BYTES = 64 * 1024;

type IdentityInput = {
  transcriptPath: unknown;
  reviewerSessionId: unknown;
  currentThreadId: unknown;
  projectRoot: unknown;
};

type IdentityOptions = { codexHome?: string };

export type CodexReviewIdentity =
  | {
      valid: true;
      sessionId: string;
      parentSessionId: string;
      agentPath: string;
      taskName: string;
      sessionMetaSha256: string;
    }
  | { valid: false; reason: string };

const reject = (reason: string): CodexReviewIdentity => ({ valid: false, reason });

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function inside(root: string, target: string, allowEqual = false): boolean {
  const value = relative(root, target);
  if (value === "") return allowEqual;
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function hasNoSymlinks(root: string, target: string): boolean {
  const value = relative(root, target);
  let cursor = root;
  for (const part of value.split(sep)) {
    if (!part) continue;
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) return false;
  }
  return true;
}

function readFirstRecord(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error("transcript must be a single-link regular file");
  if (typeof process.getuid === "function" && before.uid !== process.getuid()) throw new Error("transcript owner mismatch");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error("transcript changed before open");
    const buffer = Buffer.alloc(MAX_FIRST_RECORD_BYTES + 1);
    const count = readSync(fd, buffer, 0, buffer.length, 0);
    const newline = buffer.subarray(0, count).indexOf(0x0a);
    if (newline < 0) throw new Error("transcript first record is incomplete or oversized");
    return buffer.subarray(0, newline);
  } finally {
    closeSync(fd);
  }
}

export function validateCodexReviewIdentity(input: IdentityInput, options: IdentityOptions = {}): CodexReviewIdentity {
  try {
    const { transcriptPath, reviewerSessionId, currentThreadId, projectRoot } = input;
    const codexHome = options.codexHome ?? process.env.CODEX_HOME;
    if (![codexHome, transcriptPath, reviewerSessionId, currentThreadId, projectRoot].every(isNonEmptyString)) return reject("identity fields are incomplete");
    if (!isAbsolute(transcriptPath as string)) return reject("transcriptPath must be absolute");
    const sessionsRoot = resolve(codexHome as string, "sessions");
    const lexicalPath = resolve(transcriptPath as string);
    if (!inside(sessionsRoot, lexicalPath) || !hasNoSymlinks(sessionsRoot, lexicalPath)) return reject("transcriptPath is outside Codex sessions or traverses a symlink");
    const realRoot = realpathSync(sessionsRoot);
    const realPath = realpathSync(lexicalPath);
    if (!inside(realRoot, realPath) || !hasNoSymlinks(realRoot, realPath)) return reject("transcriptPath escapes Codex sessions");
    const firstRecord = readFirstRecord(realPath);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(firstRecord);
    const record = JSON.parse(text) as Record<string, unknown>;
    const payload = record.payload as Record<string, unknown> | undefined;
    const source = payload?.source as Record<string, unknown> | undefined;
    const subagent = source?.subagent as Record<string, unknown> | undefined;
    const spawn = subagent?.thread_spawn as Record<string, unknown> | undefined;
    if (record.type !== "session_meta" || payload?.thread_source !== "subagent") return reject("first record is not subagent session_meta");
    const childId = payload.id;
    const parentId = payload.parent_thread_id;
    if (childId !== reviewerSessionId || childId !== currentThreadId || !isNonEmptyString(parentId)) return reject("child session identity mismatch");
    if (spawn?.parent_thread_id !== parentId || spawn.depth !== 1) return reject("parent spawn chain mismatch");
    for (const field of [payload.session_id, payload.forked_from_id]) {
      if (field !== undefined && field !== parentId) return reject("parent session identity mismatch");
    }
    if (childId === parentId) return reject("child and parent sessions must differ");
    const cwd = payload.cwd;
    if (!isNonEmptyString(cwd) || !inside(resolve(cwd), resolve(projectRoot as string), true)) return reject("project root is outside the child workspace");
    if (!isNonEmptyString(payload.agent_path) || payload.agent_path !== spawn.agent_path) return reject("agent_path mismatch");
    const matched = /^\/root\/([a-z][a-z0-9_]{0,63})$/u.exec(payload.agent_path);
    if (!matched?.[1]) return reject("agent_path is not canonical");
    return {
      valid: true,
      sessionId: childId as string,
      parentSessionId: parentId,
      agentPath: payload.agent_path,
      taskName: matched[1],
      sessionMetaSha256: createHash("sha256").update(firstRecord).digest("hex"),
    };
  } catch (error) {
    return reject(error instanceof Error ? error.message : String(error));
  }
}

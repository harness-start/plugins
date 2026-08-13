import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_FIRST_RECORD_BYTES = 64 * 1024;

function reject(reason) { return { valid: false, reason }; }

function inside(root, target) {
  const rel = relative(root, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function noSymlinks(root, target) {
  const rel = relative(root, target);
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) return false;
  }
  return true;
}

function readFirstRecord(path) {
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
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, newline));
  } finally {
    closeSync(fd);
  }
}

export function codexReviewIdentity(event, { codexHome = process.env.CODEX_HOME } = {}) {
  try {
    const transcript = event?.transcript_path ?? event?.transcriptPath;
    const agentId = event?.agent_id ?? event?.agentId;
    const sessionId = event?.session_id ?? event?.sessionId;
    const cwd = event?.cwd ?? event?.working_directory ?? event?.workingDirectory;
    if (![codexHome, transcript, agentId, sessionId, cwd].every((value) => typeof value === "string" && value)) return reject("Codex identity fields are incomplete");
    if (!isAbsolute(transcript)) return reject("transcript_path must be absolute");
    const lexicalRoot = resolve(codexHome, "sessions");
    const lexicalPath = resolve(transcript);
    if (!inside(lexicalRoot, lexicalPath) || !noSymlinks(lexicalRoot, lexicalPath)) return reject("transcript_path is outside sessions or traverses a symlink");
    const realRoot = realpathSync(lexicalRoot);
    const realPath = realpathSync(lexicalPath);
    if (!inside(realRoot, realPath) || !noSymlinks(realRoot, realPath)) return reject("transcript_path escapes sessions");
    const record = JSON.parse(readFirstRecord(realPath));
    const payload = record?.payload;
    const spawn = payload?.source?.subagent?.thread_spawn;
    if (record?.type !== "session_meta" || payload?.thread_source !== "subagent") return reject("first record is not subagent session_meta");
    if (payload.id !== agentId || payload.parent_thread_id !== sessionId || spawn?.parent_thread_id !== sessionId || spawn?.depth !== 1 || resolve(payload.cwd ?? "") !== resolve(cwd)) return reject("session identity mismatch");
    if (typeof payload.agent_path !== "string" || payload.agent_path !== spawn.agent_path) return reject("agent_path mismatch");
    const matched = /^\/root\/([a-z][a-z0-9_]{0,63})$/u.exec(payload.agent_path);
    if (!matched) return reject("agent_path is not canonical");
    return { valid: true, taskName: matched[1], agentPath: payload.agent_path };
  } catch (error) {
    return reject(error?.message ?? String(error));
  }
}

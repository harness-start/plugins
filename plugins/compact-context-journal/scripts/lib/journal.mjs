import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  truncateSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const ROOT_NAME = ".compact-context-journal";
const SCHEMA = "compact-context-journal/v1";
const START = "<!-- ccj:start ";
const END = "<!-- ccj:end ";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

export function encodeSessionId(value) {
  const bytes = Buffer.from(String(value), "utf8");
  let encoded = "";
  for (const byte of bytes) {
    const safe =
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2e || byte === 0x5f || byte === 0x2d;
    encoded += safe ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}

export function decodeSessionId(value) {
  const text = String(value);
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "%" && /^[0-9A-Fa-f]{2}$/u.test(text.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    const raw = Buffer.from(text[index], "utf8");
    bytes.push(...raw);
  }
  return Buffer.from(bytes).toString("utf8");
}

function ensureRuntime(location) {
  mkdirSync(location.root, { recursive: true, mode: 0o700 });
  chmodSync(location.root, 0o700);
  mkdirSync(location.sessionsDir, { recursive: true, mode: 0o700 });
  mkdirSync(location.stateDir, { recursive: true, mode: 0o700 });
  mkdirSync(location.locksDir, { recursive: true, mode: 0o700 });
  const ignorePath = join(location.root, ".gitignore");
  if (!existsSync(ignorePath)) writeFileSync(ignorePath, "*\n", { encoding: "utf8", mode: 0o600 });
}

export function journalLocation({ cwd, host, sessionId }) {
  if (!sessionId || typeof sessionId !== "string") throw new Error("session_id is required");
  const workspaceRoot = repoRoot(cwd);
  const root = join(workspaceRoot, ROOT_NAME);
  const fileName = `${encodeSessionId(host)}-${encodeSessionId(sessionId)}`;
  return {
    workspaceRoot,
    root,
    sessionsDir: join(root, "sessions"),
    stateDir: join(root, ".state"),
    locksDir: join(root, ".locks"),
    path: join(root, "sessions", `${fileName}.md`),
    statePath: join(root, ".state", `${fileName}.json`),
    lockPath: join(root, ".locks", `${fileName}.lock`),
    host,
    sessionId,
  };
}

function headerBuffer(location) {
  const metadata = JSON.stringify({
    schema: SCHEMA,
    host: location.host,
    session_id: location.sessionId,
    hostname: hostname(),
  });
  return Buffer.from([
    "# Compact Context Journal",
    "",
    "> Append-only recovery record. Entries below are framed and hash-chained.",
    "> Earlier verified bytes are immutable; only this plugin may append.",
    "",
    `<!-- ccj:header ${metadata} -->`,
    "",
    "",
  ].join("\n"), "utf8");
}

function initialize(location) {
  ensureRuntime(location);
  if (existsSync(location.path)) return;
  writeFileSync(location.path, headerBuffer(location), { mode: 0o600, flag: "wx" });
  chmodSync(location.path, 0o600);
}

function parseJsonMarker(line, prefix, suffix = " -->") {
  if (!line.startsWith(prefix) || !line.endsWith(suffix)) return null;
  try {
    return JSON.parse(line.slice(prefix.length, -suffix.length));
  } catch {
    return null;
  }
}

function countLines(buffer, end) {
  let lines = 1;
  for (let index = 0; index < end; index += 1) if (buffer[index] === 0x0a) lines += 1;
  return lines;
}

function countNewlines(buffer) {
  let count = 0;
  for (const byte of buffer) if (byte === 0x0a) count += 1;
  return count;
}

function invalid(reason, verifiedBytes = 0, events = []) {
  return { ok: false, reason, verifiedBytes, partialTailBytes: 0, events };
}

export function verifyJournal(path, { expectedSessionId } = {}) {
  if (!existsSync(path)) return invalid("journal missing");
  const bytes = readFileSync(path);
  const headerMarker = Buffer.from("<!-- ccj:header ", "utf8");
  const headerStart = bytes.indexOf(headerMarker);
  const headerEnd = headerStart < 0
    ? -1
    : bytes.indexOf(Buffer.from(" -->\n\n", "utf8"), headerStart);
  if (headerEnd < 0) return invalid("header incomplete");
  const headerBytes = bytes.subarray(0, headerEnd + Buffer.byteLength(" -->\n\n"));
  const headerText = headerBytes.toString("utf8");
  const headerLine = headerText.split("\n").find((line) => line.startsWith("<!-- ccj:header "));
  const header = headerLine ? parseJsonMarker(headerLine, "<!-- ccj:header ") : null;
  if (!header || header.schema !== SCHEMA) return invalid("header schema invalid");
  if (expectedSessionId !== undefined && header.session_id !== expectedSessionId) {
    return invalid("header session_id mismatch");
  }

  const events = [];
  let offset = headerBytes.length;
  let previousHash = sha256(headerBytes);
  let expectedSeq = 1;
  while (offset < bytes.length) {
    const remaining = bytes.subarray(offset);
    if (!remaining.subarray(0, Buffer.byteLength(START)).equals(Buffer.from(START))) {
      const text = remaining.toString("utf8");
      if (START.startsWith(text) || text.startsWith(START)) {
        return { ok: true, header, events, verifiedBytes: offset, partialTailBytes: remaining.length, tipHash: previousHash };
      }
      return invalid("unexpected bytes after verified prefix", offset, events);
    }
    const startLineEnd = bytes.indexOf(0x0a, offset);
    if (startLineEnd < 0) {
      return { ok: true, header, events, verifiedBytes: offset, partialTailBytes: bytes.length - offset, tipHash: previousHash };
    }
    const startLine = bytes.subarray(offset, startLineEnd).toString("utf8");
    const start = parseJsonMarker(startLine, START);
    if (!start || !Number.isSafeInteger(start.seq) || !Number.isSafeInteger(start.body_bytes)) {
      return invalid("start frame invalid", offset, events);
    }
    if (start.seq !== expectedSeq || start.prev_hash !== previousHash || start.body_bytes < 1) {
      return invalid("frame sequence or previous hash invalid", offset, events);
    }
    const bodyStart = startLineEnd + 1;
    const bodyEnd = bodyStart + start.body_bytes;
    if (bodyEnd > bytes.length) {
      return { ok: true, header, events, verifiedBytes: offset, partialTailBytes: bytes.length - offset, tipHash: previousHash };
    }
    const endLineEnd = bytes.indexOf(0x0a, bodyEnd);
    if (endLineEnd < 0) {
      return { ok: true, header, events, verifiedBytes: offset, partialTailBytes: bytes.length - offset, tipHash: previousHash };
    }
    const endLine = bytes.subarray(bodyEnd, endLineEnd).toString("utf8");
    const end = parseJsonMarker(endLine, END);
    if (!end || end.seq !== start.seq) return invalid("end frame invalid", offset, events);
    const body = bytes.subarray(bodyStart, bodyEnd);
    const eventHash = sha256(Buffer.concat([Buffer.from(previousHash), Buffer.from([0]), body]));
    if (end.event_hash !== eventHash) return invalid("event hash mismatch", offset, events);
    const bodyText = body.toString("utf8");
    const eventLine = bodyText.split("\n", 1)[0];
    const embedded = parseJsonMarker(eventLine, "<!-- ccj:event ");
    const expectedId = `${String(start.prefix)}${String(start.seq).padStart(6, "0")}`;
    if (!embedded || embedded.id !== expectedId || embedded.type !== start.type) {
      return invalid("hashed event metadata mismatch", offset, events);
    }
    const bodyStartLine = countLines(bytes, bodyStart);
    const bodyLines = bodyText.split("\n");
    const bodyEndLine = bodyStartLine + Math.max(0, bodyLines.length - 2);
    const cardIndex = bodyLines.indexOf("### Recovery Card");
    let cardStartLine = null;
    let cardEndLine = null;
    if (cardIndex >= 0) {
      cardStartLine = bodyStartLine + cardIndex;
      let relativeEnd = cardIndex + 1;
      while (relativeEnd < bodyLines.length && bodyLines[relativeEnd].startsWith("- ")) relativeEnd += 1;
      cardEndLine = bodyStartLine + relativeEnd - 1;
    }
    events.push({
      id: expectedId,
      type: start.type,
      body: bodyText,
      seq: start.seq,
      startOffset: offset,
      endOffset: endLineEnd + 1,
      bodyStartLine,
      bodyEndLine,
      cardStartLine,
      cardEndLine,
      hash: eventHash,
    });
    previousHash = eventHash;
    expectedSeq += 1;
    offset = endLineEnd + 1;
  }
  return { ok: true, header, events, verifiedBytes: offset, partialTailBytes: 0, tipHash: previousHash };
}

function fenceFor(raw) {
  const runs = String(raw).match(/`+/gu) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function eventBody({ id, type, title, raw, details = [] }) {
  const value = String(raw ?? "");
  const fence = fenceFor(value);
  const lines = [
    `<!-- ccj:event ${JSON.stringify({ id, type })} -->`,
    `## ${id} · ${title}`,
    `- Recorded: ${new Date().toISOString()}`,
    ...details.map((detail) => `- ${detail}`),
    "",
    fence,
    value,
    fence,
    "",
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

function frameFor(event, seq, previousHash) {
  const id = `${event.prefix}${String(seq).padStart(6, "0")}`;
  const body = eventBody({ ...event, id });
  const start = Buffer.from(`${START}${JSON.stringify({
    seq,
    type: event.type,
    prefix: event.prefix,
    body_bytes: body.length,
    prev_hash: previousHash,
  })} -->\n`, "utf8");
  const eventHash = sha256(Buffer.concat([Buffer.from(previousHash), Buffer.from([0]), body]));
  const end = Buffer.from(`${END}${JSON.stringify({ seq, event_hash: eventHash })} -->\n`, "utf8");
  return { id, body, eventHash, bytes: Buffer.concat([start, body, end]), startBytes: start.length };
}

function writeFrame(location, frame) {
  const fd = openSync(location.path, "a", 0o600);
  try {
    writeSync(fd, frame.bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(location.path, 0o600);
}

function appendVerified(location, verified, event) {
  const seq = verified.events.length + 1;
  const frame = frameFor(event, seq, verified.tipHash);
  const offset = verified.verifiedBytes;
  writeFrame(location, frame);
  const current = verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!current.ok) throw new Error(`journal integrity failure after append: ${current.reason}`);
  const appended = current.events.at(-1);
  if (appended.id !== frame.id || appended.startOffset !== offset) throw new Error("journal append verification mismatch");
  return appended;
}

export function appendEvent(location, event) {
  initialize(location);
  let verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!verified.ok) throw new Error(`journal integrity failure: ${verified.reason}`);
  let repairedTail = false;
  if (verified.partialTailBytes > 0) {
    truncateSync(location.path, verified.verifiedBytes);
    repairedTail = true;
    const recovery = appendVerified(location, verified, {
      type: "integrity",
      prefix: "I",
      title: "Recovered unverified partial tail",
      raw: `Discarded ${verified.partialTailBytes} unverified partial tail byte(s); verified prefix preserved.`,
    });
    verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
    if (!verified.ok || recovery.id !== verified.events.at(-1).id) throw new Error("journal tail recovery failed");
  }
  const appended = appendVerified(location, verified, event);
  return { ...appended, repairedTail };
}

export function tipFromVerifiedJournal(location, verified = null) {
  const result = verified ?? verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!result.ok || result.partialTailBytes > 0) return null;
  const bytes = readFileSync(location.path);
  const stat = statSync(location.path);
  return {
    schema: "compact-context-journal-tip/v1",
    seq: result.events.length,
    tipHash: result.tipHash,
    verifiedBytes: result.verifiedBytes,
    nextLine: countLines(bytes, result.verifiedBytes),
    ino: String(stat.ino),
    sessionId: location.sessionId,
    host: location.host,
  };
}

export function tipMatchesJournal(location, tip) {
  if (!tip || tip.schema !== "compact-context-journal-tip/v1" || tip.sessionId !== location.sessionId || tip.host !== location.host) return false;
  if (!existsSync(location.path)) return false;
  try {
    const stat = statSync(location.path);
    return String(stat.ino) === tip.ino && stat.size === tip.verifiedBytes;
  } catch {
    return false;
  }
}

export function appendEventFast(location, event, cachedTip = null) {
  initialize(location);
  if (!tipMatchesJournal(location, cachedTip)) {
    const appended = appendEvent(location, event);
    const verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
    const tip = tipFromVerifiedJournal(location, verified);
    if (!tip) throw new Error("journal tip recovery failed");
    return { event: appended, tip };
  }
  const seq = cachedTip.seq + 1;
  const frame = frameFor(event, seq, cachedTip.tipHash);
  const bodyText = frame.body.toString("utf8");
  const bodyLines = bodyText.split("\n");
  const bodyStartLine = cachedTip.nextLine + 1;
  const bodyEndLine = bodyStartLine + Math.max(0, bodyLines.length - 2);
  const cardIndex = bodyLines.indexOf("### Recovery Card");
  let cardStartLine = null;
  let cardEndLine = null;
  if (cardIndex >= 0) {
    cardStartLine = bodyStartLine + cardIndex;
    let relativeEnd = cardIndex + 1;
    while (relativeEnd < bodyLines.length && bodyLines[relativeEnd].startsWith("- ")) relativeEnd += 1;
    cardEndLine = bodyStartLine + relativeEnd - 1;
  }
  writeFrame(location, frame);
  const stat = statSync(location.path);
  const appended = {
    id: frame.id,
    type: event.type,
    body: bodyText,
    seq,
    startOffset: cachedTip.verifiedBytes,
    endOffset: cachedTip.verifiedBytes + frame.bytes.length,
    bodyStartLine,
    bodyEndLine,
    cardStartLine,
    cardEndLine,
    hash: frame.eventHash,
    repairedTail: false,
  };
  return {
    event: appended,
    tip: {
      ...cachedTip,
      seq,
      tipHash: frame.eventHash,
      verifiedBytes: appended.endOffset,
      nextLine: cachedTip.nextLine + countNewlines(frame.bytes),
      ino: String(stat.ino),
    },
  };
}

export function isInsideJournal(candidate, location) {
  const path = resolve(candidate);
  const root = resolve(location.root);
  return path === root || path.startsWith(`${root}/`);
}

export function resolveEventPath(candidate, cwd) {
  return isAbsolute(candidate) ? resolve(candidate) : resolve(cwd, candidate.replace(/^\.\//u, ""));
}

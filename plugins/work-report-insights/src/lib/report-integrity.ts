import { createHash, type BinaryLike } from "node:crypto";

export const SEAL_PREFIX = "<!-- work-report-insights:sha256:";
const SEAL_PATTERN = /^<!-- work-report-insights:sha256:([a-f0-9]{64}) -->$/gmu;
export const CHAIN_V2_PREFIX = "<!-- work-report-insights:chain-v2:";
const CHAIN_V2_PATTERN = /^<!-- work-report-insights:chain-v2:prev-length=(\d+);prev=([a-f0-9]{64});sha256=([a-f0-9]{64}) -->$/gmu;

export function sha256(value: BinaryLike): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sealReport(body: unknown): string {
  const bytes = String(body ?? "");
  if (bytes.includes(SEAL_PREFIX)) {
    throw new Error("report body contains a reserved seal marker");
  }
  if (!bytes.endsWith("\n")) {
    throw new Error("report body must end with a newline");
  }
  return `${bytes}${SEAL_PREFIX}${sha256(bytes)} -->\n`;
}

export type VerifyFailure = {
  ok: false;
  kind: "malformed" | "unsealed" | "mismatch";
  reason: string;
};

export type VerifySuccess = {
  ok: true;
  body: string;
  digest: string;
  suffix: string;
  additions: number;
  legacySuffixUnverified: boolean;
};

export type VerifyResult = VerifyFailure | VerifySuccess;

export function appendChainV2(previous: string, block: string): string {
  const checked = verifyReport(previous);
  if (!checked.ok) throw new Error(`report cannot be chained: ${checked.reason}`);
  if (!block || block.includes(SEAL_PREFIX) || block.includes(CHAIN_V2_PREFIX)) throw new Error("addition contains a reserved integrity marker");
  const prefix = `${previous}${block}`;
  const marker = `${CHAIN_V2_PREFIX}prev-length=${previous.length};prev=${sha256(previous)};sha256=${sha256(prefix)} -->\n`;
  return `${prefix}${marker}`;
}

export function verifyReport(content: unknown): VerifyResult {
  const text = String(content ?? "");
  const matches = [...text.matchAll(SEAL_PATTERN)];
  if (matches.length === 0) {
    if (text.includes(SEAL_PREFIX)) {
      return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
    }
    return { ok: false, kind: "unsealed", reason: "seal marker is missing" };
  }
  if (matches.length !== 1) {
    return { ok: false, kind: "malformed", reason: "report must contain exactly one seal marker" };
  }
  const marker = matches[0];
  if (marker === undefined || marker.index === undefined) {
    return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
  }
  const body = text.slice(0, marker.index);
  const digest = marker[1];
  if (digest === undefined) {
    return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
  }
  const suffix = text.slice(marker.index + marker[0].length);
  if (suffix.includes(SEAL_PREFIX)) {
    return { ok: false, kind: "malformed", reason: "report suffix contains a reserved seal marker" };
  }
  if (sha256(body) !== digest) {
    return { ok: false, kind: "mismatch", reason: "report body SHA-256 does not match the seal" };
  }
  const chainMatches = [...text.matchAll(CHAIN_V2_PATTERN)];
  if (suffix.includes(CHAIN_V2_PREFIX) && chainMatches.length === 0) {
    return { ok: false, kind: "malformed", reason: "V2 chain marker is malformed" };
  }
  const baseMarkerEnd = marker.index + marker[0].length;
  const baseEnd = text[baseMarkerEnd] === "\n" ? baseMarkerEnd + 1 : baseMarkerEnd;
  if (chainMatches.length === 0) {
    return { ok: true, body, digest, suffix, additions: 0, legacySuffixUnverified: text.slice(baseEnd).trim().length > 0 };
  }
  let previousEnd = baseEnd;
  let legacySuffixUnverified = false;
  for (let index = 0; index < chainMatches.length; index += 1) {
    const chain = chainMatches[index];
    if (!chain || chain.index === undefined || !chain[1] || !chain[2] || !chain[3]) {
      return { ok: false, kind: "malformed", reason: "V2 chain marker is malformed" };
    }
    const previousLength = Number.parseInt(chain[1], 10);
    if (!Number.isSafeInteger(previousLength) || previousLength < previousEnd || previousLength >= chain.index) {
      return { ok: false, kind: "malformed", reason: "V2 chain boundary is invalid" };
    }
    if (index > 0 && previousLength !== previousEnd) {
      return { ok: false, kind: "mismatch", reason: "V2 chain does not continue from the previous marker" };
    }
    if (index === 0 && text.slice(baseEnd, previousLength).trim()) legacySuffixUnverified = true;
    if (sha256(text.slice(0, previousLength)) !== chain[2]) {
      return { ok: false, kind: "mismatch", reason: "V2 chain previous-file digest mismatch" };
    }
    if (sha256(text.slice(0, chain.index)) !== chain[3]) {
      return { ok: false, kind: "mismatch", reason: "V2 chain addition digest mismatch" };
    }
    const end = chain.index + chain[0].length;
    previousEnd = text[end] === "\n" ? end + 1 : end;
  }
  if (text.slice(previousEnd).length > 0) {
    return { ok: false, kind: "mismatch", reason: "report has an unauthenticated tail after the V2 chain" };
  }
  return { ok: true, body, digest, suffix, additions: chainMatches.length, legacySuffixUnverified };
}

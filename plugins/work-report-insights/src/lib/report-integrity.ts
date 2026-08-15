import { createHash } from "node:crypto";

export const SEAL_PREFIX = "<!-- work-report-insights:sha256:";
const SEAL_PATTERN = /^<!-- work-report-insights:sha256:([a-f0-9]{64}) -->$/gmu;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sealReport(body) {
  const bytes = String(body ?? "");
  if (bytes.includes(SEAL_PREFIX)) {
    throw new Error("report body contains a reserved seal marker");
  }
  if (!bytes.endsWith("\n")) {
    throw new Error("report body must end with a newline");
  }
  return `${bytes}${SEAL_PREFIX}${sha256(bytes)} -->\n`;
}

export function verifyReport(content) {
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
  const body = text.slice(0, marker.index);
  const digest = marker[1];
  const suffix = text.slice(marker.index + marker[0].length);
  if (suffix.includes(SEAL_PREFIX)) {
    return { ok: false, kind: "malformed", reason: "report suffix contains a reserved seal marker" };
  }
  if (sha256(body) !== digest) {
    return { ok: false, kind: "mismatch", reason: "report body SHA-256 does not match the seal" };
  }
  return { ok: true, body, digest, suffix };
}

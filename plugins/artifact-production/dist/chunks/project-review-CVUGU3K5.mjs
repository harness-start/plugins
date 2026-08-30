#!/usr/bin/env node
// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "./chunk-GMAR232S.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-SLROGW3A.mjs";
import {
  AESTHETIC_CRITERIA,
  REVIEW_CHECKS,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computeLogoSubjectDigest,
  masterSubjectDigest,
  reviewArtifactPaths,
  validateLogoModel
} from "./chunk-H3J7AVEN.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "./chunk-ZCG2IIFY.mjs";
import "./chunk-XFYUIVLB.mjs";
import {
  communicationAnchors,
  communicationReviewValid
} from "./chunk-TPU7ENF4.mjs";
import "./chunk-64RZK2M5.mjs";

// plugins/artifact-production/src/domains/logo/entries/cli/project-review.ts
import { createHash as createHash2 } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute as isAbsolute2, relative as relative2, resolve as resolve2 } from "node:path";

// plugins/artifact-production/src/domains/logo/lib/codex-review-identity.ts
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
var MAX_FIRST_RECORD_BYTES = 64 * 1024;
var reject = (reason) => ({ valid: false, reason });
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function inside(root, target, allowEqual = false) {
  const value = relative(root, target);
  if (value === "") return allowEqual;
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}
function hasNoSymlinks(root, target) {
  const value = relative(root, target);
  let cursor = root;
  for (const part of value.split(sep)) {
    if (!part) continue;
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
    const newline = buffer.subarray(0, count).indexOf(10);
    if (newline < 0) throw new Error("transcript first record is incomplete or oversized");
    return buffer.subarray(0, newline);
  } finally {
    closeSync(fd);
  }
}
function validateCodexReviewIdentity(input, options = {}) {
  try {
    const { transcriptPath, reviewerSessionId, currentThreadId, projectRoot } = input;
    const codexHome = options.codexHome ?? process.env.CODEX_HOME;
    if (![codexHome, transcriptPath, reviewerSessionId, currentThreadId, projectRoot].every(isNonEmptyString)) return reject("identity fields are incomplete");
    if (!isAbsolute(transcriptPath)) return reject("transcriptPath must be absolute");
    const sessionsRoot = resolve(codexHome, "sessions");
    const lexicalPath = resolve(transcriptPath);
    if (!inside(sessionsRoot, lexicalPath) || !hasNoSymlinks(sessionsRoot, lexicalPath)) return reject("transcriptPath is outside Codex sessions or traverses a symlink");
    const realRoot = realpathSync(sessionsRoot);
    const realPath = realpathSync(lexicalPath);
    if (!inside(realRoot, realPath) || !hasNoSymlinks(realRoot, realPath)) return reject("transcriptPath escapes Codex sessions");
    const firstRecord = readFirstRecord(realPath);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(firstRecord);
    const record2 = JSON.parse(text);
    const payload = record2.payload;
    const source = payload?.source;
    const subagent = source?.subagent;
    const spawn = subagent?.thread_spawn;
    if (record2.type !== "session_meta" || payload?.thread_source !== "subagent") return reject("first record is not subagent session_meta");
    const childId = payload.id;
    const parentId = payload.parent_thread_id;
    if (childId !== reviewerSessionId || childId !== currentThreadId || !isNonEmptyString(parentId)) return reject("child session identity mismatch");
    if (spawn?.parent_thread_id !== parentId || spawn.depth !== 1) return reject("parent spawn chain mismatch");
    for (const field of [payload.session_id, payload.forked_from_id]) {
      if (field !== void 0 && field !== parentId) return reject("parent session identity mismatch");
    }
    if (childId === parentId) return reject("child and parent sessions must differ");
    const cwd = payload.cwd;
    if (!isNonEmptyString(cwd) || !inside(resolve(cwd), resolve(projectRoot), true)) return reject("project root is outside the child workspace");
    if (!isNonEmptyString(payload.agent_path) || payload.agent_path !== spawn.agent_path) return reject("agent_path mismatch");
    const matched = /^\/root\/([a-z][a-z0-9_]{0,63})$/u.exec(payload.agent_path);
    if (!matched?.[1]) return reject("agent_path is not canonical");
    return {
      valid: true,
      sessionId: childId,
      parentSessionId: parentId,
      agentPath: payload.agent_path,
      taskName: matched[1],
      sessionMetaSha256: createHash("sha256").update(firstRecord).digest("hex")
    };
  } catch (error) {
    return reject(error instanceof Error ? error.message : String(error));
  }
}

// plugins/artifact-production/src/domains/logo/entries/cli/project-review.ts
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
async function main() {
  const root = await assertLogoProjectRoot(resolve2(process.argv[2] ?? ""));
  const grant = await consumeWriterCapability({ root, capability: "logo-review", argv: processWriterArgv() });
  const inputPath = resolve2(process.argv[3] ?? "");
  const relativeInput = relative2(root, inputPath);
  if (!isAbsolute2(inputPath) || !relativeInput.startsWith("..") && relativeInput !== "") throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let payload;
  try {
    payload = record(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Error("REVIEW_INPUT_JSON_INVALID");
  }
  const model = await loadLogoProject(root);
  const subjectDigest = computeLogoSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest || payload.schema !== REVIEW_INPUT_SCHEMA || payload.artifactId !== model.artifactId || payload.subjectDigest !== subjectDigest || payload.decision !== "approved") throw new Error("REVIEW_INPUT_INVALID");
  const blocking = validateLogoModel(model, { stage: "release" }).filter(({ path, code }) => path !== "review.logo.json" && path !== "release.manifest.json" && path !== "receipt.release.json" && code !== "RECEIPT_INVALID");
  if (blocking.length) throw new Error(blocking.map(({ code, path }) => `${code}:${path}`).join(", "));
  const reviewer = record(payload.reviewer);
  let render = {};
  try {
    render = record(JSON.parse(String(model.files["evidence.render.json"])));
  } catch {
  }
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id) throw new Error("SELF_REVIEW_DENIED");
  let admittedReviewer = reviewer;
  if (reviewer.kind === "independent-agent" && grant.codexHome) {
    const identity = validateCodexReviewIdentity({
      transcriptPath: reviewer.transcriptPath,
      reviewerSessionId: reviewer.sessionId,
      currentThreadId: grant.sessionId,
      projectRoot: root
    }, { codexHome: grant.codexHome });
    if (!identity.valid) throw new Error(`CODEX_REVIEW_IDENTITY_INVALID:${identity.reason}`);
    if (identity.sessionId !== grant.sessionId || identity.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
    admittedReviewer = {
      kind: reviewer.kind,
      id: reviewer.id,
      sessionId: identity.sessionId,
      parentSessionId: identity.parentSessionId,
      agentPath: identity.agentPath,
      sessionMetaSha256: identity.sessionMetaSha256
    };
  } else if (reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) {
    throw new Error("SELF_REVIEW_DENIED");
  }
  const coverage = Array.isArray(payload.coverage) ? payload.coverage.map(record) : [];
  const expectedPaths = reviewArtifactPaths(model);
  if (coverage.length !== expectedPaths.length || coverage.some((entry, index) => entry.path !== expectedPaths[index] || entry.sha256 !== model.digests[expectedPaths[index] ?? ""])) throw new Error("REVIEW_COVERAGE_INVALID");
  const checks = Array.isArray(payload.checks) ? payload.checks.map(record) : [];
  if (!REVIEW_CHECKS.every((id) => checks.some((entry) => entry.id === id && entry.status === "pass"))) throw new Error("REVIEW_CHECKS_INCOMPLETE");
  const criteria = record(payload.criteria);
  for (const id of AESTHETIC_CRITERIA) {
    const row = record(criteria[id]);
    const requiredMin = Number(row.requiredMin);
    if (!Number.isFinite(row.score) || !Number.isFinite(requiredMin) || requiredMin < 2 || Number(row.score) < requiredMin || typeof row.note !== "string" || row.note.trim().length < 8) throw new Error("REVIEW_CRITERIA_INCOMPLETE");
  }
  const findings = Array.isArray(payload.findings) ? payload.findings.map(record) : [];
  if (findings.some((entry) => typeof entry.evidenceAnchor === "string" && expectedPaths.includes(entry.evidenceAnchor) && entry.artifactDigest !== model.digests[entry.evidenceAnchor])) throw new Error("REVIEW_FINDING_DIGEST_MISMATCH");
  if (findings.some((entry) => !["blocker", "major", "minor", "info"].includes(String(entry.severity)) || typeof entry.findingId !== "string" || !entry.findingId.trim() || typeof entry.evidenceAnchor !== "string" || !expectedPaths.includes(entry.evidenceAnchor) || !/^[a-f0-9]{64}$/u.test(String(entry.artifactDigest)) || typeof entry.fix !== "string" || !entry.fix.trim() || !["open", "fixed_pending_recheck", "verified"].includes(String(entry.status)) || ["blocker", "major"].includes(String(entry.severity)) && (entry.status !== "verified" || typeof entry.recheckEvidence !== "string" || !entry.recheckEvidence.trim()))) throw new Error("REVIEW_FINDING_UNRESOLVED");
  const brief = record(JSON.parse(String(model.files["plan.brief.json"])));
  const communicationCore = record(brief.communicationCore);
  if (!communicationReviewValid(payload, communicationCore.retellTarget, communicationAnchors(communicationCore))) throw new Error("COMMUNICATION_REVIEW_INCOMPLETE");
  const stripPath = expectedPaths.find((path) => /evidence\/preview\/strip\..+\.png$/u.test(path)) ?? "";
  const output = { schema: REVIEW_SCHEMA, plugin: "brand-logo-production", artifactId: model.artifactId, subjectDigest, masterDigest: masterSubjectDigest(model), squintStripDigest: model.digests[stripPath], decision: "approved", reviewer: admittedReviewer, coverage, checks, criteria, findings, reviewerRetell: payload.reviewerRetell, communicationReview: payload.communicationReview, reviewInputSha256: createHash2("sha256").update(bytes).digest("hex"), ...sessionMetadata("logo-review", grant) };
  await withWriterJournal(root, "logo-review", grant, () => atomicWriteJson(root, "review.logo.json", output));
  process.stdout.write(`${JSON.stringify({ decision: "approved", sha256: createHash2("sha256").update(`${JSON.stringify(output, null, 2)}
`).digest("hex") })}
`);
}
await main().catch((error) => {
  process.stderr.write(`[logo-project-review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

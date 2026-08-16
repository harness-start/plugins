#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { REVIEW_INPUT_SCHEMA, REVIEW_SCHEMA, computeLogoSubjectDigest, masterSubjectDigest, reviewArtifactPaths, validateLogoModel, type JsonRecord } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { assertLogoProjectRoot, loadLogoProject } from "../../lib/project.js";
import { atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

const record = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

async function main() {
  const root = await assertLogoProjectRoot(resolve(process.argv[2] ?? ""));
  const grant = await consumeWriterCapability({ root, capability: "logo-review", argv: processWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  const relativeInput = relative(root, inputPath);
  if (!isAbsolute(inputPath) || (!relativeInput.startsWith("..") && relativeInput !== "")) throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let payload: JsonRecord;
  try { payload = record(JSON.parse(bytes.toString("utf8"))); } catch { throw new Error("REVIEW_INPUT_JSON_INVALID"); }
  const model = await loadLogoProject(root);
  const subjectDigest = computeLogoSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest || payload.schema !== REVIEW_INPUT_SCHEMA || payload.artifactId !== model.artifactId || payload.subjectDigest !== subjectDigest || payload.decision !== "approved") throw new Error("REVIEW_INPUT_INVALID");
  const blocking = validateLogoModel(model, { stage: "release" }).filter(({ path, code }) => path !== "review.logo.json" && path !== "release.manifest.json" && path !== "receipt.release.json" && code !== "RECEIPT_INVALID");
  if (blocking.length) throw new Error(blocking.map(({ code, path }) => `${code}:${path}`).join(", "));
  const reviewer = record(payload.reviewer);
  let render: JsonRecord = {};
  try { render = record(JSON.parse(String(model.files["evidence.render.json"]))); } catch { /* validated above */ }
  if (!['human', 'independent-agent'].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
  const coverage = Array.isArray(payload.coverage) ? payload.coverage.map(record) : [];
  const expectedPaths = reviewArtifactPaths(model);
  if (coverage.length !== expectedPaths.length || coverage.some((entry, index) => entry.path !== expectedPaths[index] || entry.sha256 !== model.digests[expectedPaths[index] ?? ""])) throw new Error("REVIEW_COVERAGE_INVALID");
  const checks = Array.isArray(payload.checks) ? payload.checks.map(record) : [];
  if (!["geometry", "legibility", "variants"].every((id) => checks.some((entry) => entry.id === id && entry.status === "pass"))) throw new Error("REVIEW_CHECKS_INCOMPLETE");
  const criteria = record(payload.criteria);
  for (const id of ["singleMemoryPoint", "opticalCraft", "markWordmarkSystem"]) {
    const row = record(criteria[id]);
    const requiredMin = Number(row.requiredMin);
    if (!Number.isFinite(row.score) || !Number.isFinite(requiredMin) || requiredMin < 2 || Number(row.score) < requiredMin || typeof row.note !== "string" || row.note.trim().length < 8) throw new Error("REVIEW_CRITERIA_INCOMPLETE");
  }
  const findings = Array.isArray(payload.findings) ? payload.findings.map(record) : [];
  if (findings.some((entry) => typeof entry.evidenceAnchor === "string" && expectedPaths.includes(entry.evidenceAnchor) && entry.artifactDigest !== model.digests[entry.evidenceAnchor])) throw new Error("REVIEW_FINDING_DIGEST_MISMATCH");
  if (findings.some((entry) => !["blocker", "major", "minor", "info"].includes(String(entry.severity)) || typeof entry.findingId !== "string" || !entry.findingId.trim() || typeof entry.evidenceAnchor !== "string" || !expectedPaths.includes(entry.evidenceAnchor) || !/^[a-f0-9]{64}$/u.test(String(entry.artifactDigest)) || typeof entry.fix !== "string" || !entry.fix.trim() || !["open", "fixed_pending_recheck", "verified"].includes(String(entry.status)) || (["blocker", "major"].includes(String(entry.severity)) && (entry.status !== "verified" || typeof entry.recheckEvidence !== "string" || !entry.recheckEvidence.trim())))) throw new Error("REVIEW_FINDING_UNRESOLVED");
  const stripPath = expectedPaths.find((path) => /evidence\/preview\/strip\..+\.png$/u.test(path)) ?? "";
  const output = { schema: REVIEW_SCHEMA, plugin: "logo-project-delivery-guard", artifactId: model.artifactId, subjectDigest, masterDigest: masterSubjectDigest(model), squintStripDigest: model.digests[stripPath], decision: "approved", reviewer, coverage, checks, criteria, findings, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...sessionMetadata("logo-review", grant) };
  await withWriterJournal(root, "logo-review", grant, () => atomicWriteJson(root, "review.logo.json", output));
  process.stdout.write(`${JSON.stringify({ decision: "approved", sha256: createHash("sha256").update(`${JSON.stringify(output, null, 2)}\n`).digest("hex") })}\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[logo-project-review] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });

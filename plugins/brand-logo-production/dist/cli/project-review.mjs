#!/usr/bin/env node
// harness-source-hash: sha256:4888bad0e7f3076932bf8366e2bf0d197a81108a5370fc3844afcf8ac5aeadb1
import {
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-T6X744UN.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-SZOIFA6B.mjs";
import {
  AESTHETIC_CRITERIA,
  REVIEW_CHECKS,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computeLogoSubjectDigest,
  masterSubjectDigest,
  reviewArtifactPaths,
  validateLogoModel
} from "../chunks/chunk-XEZ2QFQK.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-U7FHIFHB.mjs";

// plugins/brand-logo-production/src/entries/cli/project-review.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
async function main() {
  const root = await assertLogoProjectRoot(resolve(process.argv[2] ?? ""));
  const grant = await consumeWriterCapability({ root, capability: "logo-review", argv: processWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  const relativeInput = relative(root, inputPath);
  if (!isAbsolute(inputPath) || !relativeInput.startsWith("..") && relativeInput !== "") throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
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
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
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
  const stripPath = expectedPaths.find((path) => /evidence\/preview\/strip\..+\.png$/u.test(path)) ?? "";
  const output = { schema: REVIEW_SCHEMA, plugin: "brand-logo-production", artifactId: model.artifactId, subjectDigest, masterDigest: masterSubjectDigest(model), squintStripDigest: model.digests[stripPath], decision: "approved", reviewer, coverage, checks, criteria, findings, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...sessionMetadata("logo-review", grant) };
  await withWriterJournal(root, "logo-review", grant, () => atomicWriteJson(root, "review.logo.json", output));
  process.stdout.write(`${JSON.stringify({ decision: "approved", sha256: createHash("sha256").update(`${JSON.stringify(output, null, 2)}
`).digest("hex") })}
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

#!/usr/bin/env node
// harness-source-hash: sha256:1a99b67afd74c65d95d81464d3201e20bfa4123e69f24b920c1be5cb984427ad
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-XLAB7OOT.mjs";
import {
  REVIEW_SCHEMA,
  assertPosterProjectRoot,
  atomicWriteJson,
  computePosterSubjectDigest,
  loadPosterProject,
  sessionMetadata,
  validatePosterModel,
  withWriterJournal
} from "../chunks/chunk-77CKVA44.mjs";

// plugins/poster-production/src/entries/cli/project-review.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "poster-review", argv: processWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  const relativeInput = relative(root, inputPath);
  if (!isAbsolute(inputPath) || !relativeInput.startsWith("..") && relativeInput !== "") throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let input;
  try {
    input = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("REVIEW_INPUT_JSON_INVALID");
  }
  const payload = record(input);
  let model = await loadPosterProject(root);
  if (grant.subjectDigest !== computePosterSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validatePosterModel(model, { stage: "probe" }).filter(({ code }) => code !== "REVIEW_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const reviewer = record(payload.reviewer);
  const render = record(JSON.parse(String(model.files?.["evidence.render.json"])));
  const manifest = JSON.parse(String(model.files?.["src/variants/manifest.json"]));
  const variants = Array.isArray(payload.variants) ? payload.variants.map(record) : [];
  if (payload.schema !== "poster-production/review-input/v2" || payload.artifactId !== model.artifactId || payload.subjectDigest !== computePosterSubjectDigest(model) || payload.verdict !== "pass") throw new Error("REVIEW_INPUT_INVALID");
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
  if (variants.length !== manifest.variants.length || variants.some((variant, index) => variant.id !== manifest.variants[index]?.id || variant.pngSha256 !== model.digests?.[`dist/${model.artifactId}.${String(variant.id)}.png`] || variant.verdict !== "pass")) throw new Error("REVIEW_VARIANT_COVERAGE_INVALID");
  const requiredChecks = ["hierarchy", "typography", "legibility", "clipping", "color", "copy", "profileFidelity", "assetIntegrity"];
  const checks = record(payload.checks);
  if (requiredChecks.some((key) => checks[key] !== "pass")) throw new Error("REVIEW_CHECKS_INCOMPLETE");
  const reviewFindings = Array.isArray(payload.findings) ? payload.findings.map(record) : [];
  if (reviewFindings.some((entry) => !["resolved", "accepted"].includes(String(entry.disposition)) || !["low", "medium", "high", "critical"].includes(String(entry.severity)) || typeof entry.anchor !== "string" || typeof entry.evidence !== "string" || typeof entry.recovery !== "string")) throw new Error("REVIEW_FINDING_UNRESOLVED");
  await withWriterJournal(root, "poster-review", async () => {
    await atomicWriteJson(root, "review.poster.json", { schema: REVIEW_SCHEMA, plugin: "poster-production", artifactId: model.artifactId, subjectDigest: computePosterSubjectDigest(model), verdict: "pass", reviewer, variants, findings: reviewFindings, checks, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...sessionMetadata("poster-review", grant) });
  }, grant);
  model = await loadPosterProject(root);
  process.stdout.write(`${JSON.stringify({ verdict: "pass", sha256: model.digests?.["review.poster.json"] })}
`);
}
main().catch((error) => {
  process.stderr.write(`[poster-project-review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

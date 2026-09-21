#!/usr/bin/env node
// harness-source-hash: sha256:5a69b2936e6051b23a45a0fe4c95ae9b70fc60d9e4a2f87fcad9fc09c2802d4a
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-SYTUO6VZ.mjs";
import {
  assertPptxProjectRoot,
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "./chunk-LDWQYWOG.mjs";
import {
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computePptxSubjectDigest,
  loadPptxProject,
  presentationReviewChecksValid,
  presentationReviewFindingsValid,
  validatePptxModel
} from "./chunk-ZGOEUODB.mjs";
import "./chunk-X2YRUGE2.mjs";
import "./chunk-V2UVYWCZ.mjs";
import "./chunk-LNZRBHYO.mjs";
import {
  communicationAnchors,
  communicationReviewValid
} from "./chunk-6TTQXZBL.mjs";
import "./chunk-2VFKL446.mjs";

// plugins/artifact-production/src/domains/presentation/entries/cli/project-review.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
async function main() {
  const root = assertPptxProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "pptx-review", argv: processWriterArgv() });
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
  let model = await loadPptxProject(root);
  if (grant.subjectDigest !== computePptxSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validatePptxModel(model, { stage: "probe" }).filter(({ code }) => code !== "REVIEW_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const reviewer = record(payload.reviewer);
  const render = record(JSON.parse(String(model.files?.["evidence.render.json"])));
  const manifest = record(JSON.parse(String(model.files?.["src/slides/manifest.json"])));
  const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
  const pages = Array.isArray(payload.pages) ? payload.pages.map(record) : [];
  if (payload.schema !== REVIEW_INPUT_SCHEMA || payload.artifactId !== model.artifactId || payload.subjectDigest !== computePptxSubjectDigest(model) || payload.verdict !== "pass") throw new Error("REVIEW_INPUT_INVALID");
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
  if (pages.length !== slides.length || pages.some((page, index) => page.index !== index + 1 || page.sha256 !== model.digests?.[`dist/pages/${String(index + 1).padStart(3, "0")}.png`] || page.verdict !== "pass")) throw new Error("REVIEW_PAGE_COVERAGE_INVALID");
  const core = record(record(model.plan).communicationCore);
  if (!communicationReviewValid(payload, core.retellTarget, communicationAnchors(core))) throw new Error("COMMUNICATION_REVIEW_INCOMPLETE");
  const reviewFindings = Array.isArray(payload.findings) ? payload.findings : [];
  const storyboard = record(JSON.parse(String(model.files?.["plan.storyboard.json"])));
  const relationshipRequired = Array.isArray(storyboard.slides) && storyboard.slides.some((entry) => {
    const visual = record(record(entry).visual);
    return visual.type === "diagram";
  });
  const reviewAnchors = new Set(
    Array.isArray(storyboard.slides) ? storyboard.slides.map((entry) => `slide:${String(record(entry).id ?? "")}`) : []
  );
  const reviewPageHashes = new Map(
    pages.map((page) => [Number(page.index), String(page.sha256 ?? "")])
  );
  if (!presentationReviewFindingsValid(reviewFindings, reviewAnchors, reviewPageHashes)) throw new Error("REVIEW_FINDING_INVALID");
  if (!presentationReviewChecksValid(payload.checks, relationshipRequired, reviewAnchors)) throw new Error("REVIEW_CHECKS_INCOMPLETE");
  await withWriterJournal(root, "pptx-review", async () => {
    await atomicWriteJson(root, "review.pptx.json", { schema: REVIEW_SCHEMA, plugin: "presentation-production", artifactId: model.artifactId, subjectDigest: computePptxSubjectDigest(model), verdict: "pass", reviewer, pages, findings: reviewFindings, checks: payload.checks ?? {}, reviewerRetell: payload.reviewerRetell, communicationReview: payload.communicationReview, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...sessionMetadata("pptx-review", grant) });
  }, grant);
  model = await loadPptxProject(root);
  process.stdout.write(`${JSON.stringify({ verdict: "pass", sha256: model.digests?.["review.pptx.json"] })}
`);
}
await main().catch((error) => {
  process.stderr.write(`[pptx-project-review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

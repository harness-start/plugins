#!/usr/bin/env node
// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-XFZ6O5CW.mjs";
import {
  assertPptxProjectRoot,
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "./chunk-WD55DXJZ.mjs";
import {
  REVIEW_SCHEMA,
  computePptxSubjectDigest,
  loadPptxProject,
  validatePptxModel
} from "./chunk-PCGQKVAV.mjs";
import "./chunk-RQQ3DLME.mjs";
import "./chunk-FL36SZ6K.mjs";
import "./chunk-IE4NLJBE.mjs";
import "./chunk-HL4EEBT7.mjs";

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
  if (payload.schema !== "presentation-production/review-input/v1" || payload.artifactId !== model.artifactId || payload.subjectDigest !== computePptxSubjectDigest(model) || payload.verdict !== "pass") throw new Error("REVIEW_INPUT_INVALID");
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
  if (pages.length !== slides.length || pages.some((page, index) => page.index !== index + 1 || page.sha256 !== model.digests?.[`dist/pages/${String(index + 1).padStart(3, "0")}.png`] || page.verdict !== "pass")) throw new Error("REVIEW_PAGE_COVERAGE_INVALID");
  const reviewFindings = Array.isArray(payload.findings) ? payload.findings : [];
  if (reviewFindings.some((entry) => !["resolved", "accepted"].includes(String(record(entry).disposition)))) throw new Error("REVIEW_FINDING_UNRESOLVED");
  await withWriterJournal(root, "pptx-review", async () => {
    await atomicWriteJson(root, "review.pptx.json", { schema: REVIEW_SCHEMA, plugin: "presentation-production", artifactId: model.artifactId, subjectDigest: computePptxSubjectDigest(model), verdict: "pass", reviewer, pages, findings: reviewFindings, checks: payload.checks ?? {}, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...sessionMetadata("pptx-review", grant) });
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

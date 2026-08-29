#!/usr/bin/env node
// harness-source-hash: sha256:96450b76707b49d6cf88e7353b81a09c2ceb3d5ac716f037a5a526d3923840bd
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-4FIKZS3W.mjs";
import {
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  assertDiagramProjectRoot,
  atomicWriteJson,
  computeDiagramSubjectDigest,
  loadDiagramProject,
  sessionMetadata,
  validateDiagramModel,
  withWriterJournal
} from "../chunks/chunk-BU7RQJOL.mjs";

// plugins/artifact-production/modules/diagram/src/entries/cli/project-review.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var rec = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]);
  const rawInputPath = process.argv[3] ?? "";
  if (!isAbsolute(rawInputPath)) throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const inputPath = resolve(rawInputPath);
  const relativeInput = relative(root, inputPath);
  if (!relativeInput.startsWith("..") && relativeInput !== "") throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let payload;
  try {
    payload = rec(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Error("REVIEW_INPUT_JSON_INVALID");
  }
  let model = await loadDiagramProject(root);
  const grant = await consumeWriterCapability({ root, capability: "diagram-review", argv: processWriterArgv() });
  if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validateDiagramModel(model, { stage: "probe" }).filter(({ code }) => code !== "REVIEW_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const reviewer = rec(payload.reviewer);
  const render = rec(JSON.parse(String(model.files?.["evidence.render.json"])));
  const checks = rec(payload.checks);
  if (payload.schema !== REVIEW_INPUT_SCHEMA || payload.artifactId !== model.artifactId || payload.subjectDigest !== computeDiagramSubjectDigest(model) || payload.verdict !== "pass") throw new Error("REVIEW_INPUT_INVALID");
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
  for (const key of ["hierarchy", "routing", "labels", "accessibility", "fidelity"]) {
    const check = rec(checks[key]);
    if (check.status !== "pass" || typeof check.anchor !== "string" || !check.anchor || typeof check.evidence !== "string" || !check.evidence || typeof check.recovery !== "string" || !check.recovery) throw new Error("REVIEW_CHECKS_INCOMPLETE");
  }
  const reviewFindings = Array.isArray(payload.findings) ? payload.findings.map(rec) : [];
  if (reviewFindings.some((entry) => !["resolved", "accepted"].includes(String(entry.disposition)) || !["low", "medium", "high", "critical"].includes(String(entry.severity)) || typeof entry.anchor !== "string" || typeof entry.evidence !== "string" || typeof entry.recovery !== "string" || entry.disposition === "accepted" && ["high", "critical"].includes(String(entry.severity)))) throw new Error("REVIEW_FINDING_UNRESOLVED");
  await withWriterJournal(root, "diagram-review", async () => {
    await atomicWriteJson(root, "review.diagram.json", { schema: REVIEW_SCHEMA, plugin: "diagram-production", artifactId: model.artifactId, subjectDigest: computeDiagramSubjectDigest(model), verdict: "pass", reviewer, checks, findings: reviewFindings, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...sessionMetadata("diagram-review", grant) });
  }, grant);
  model = await loadDiagramProject(root);
  process.stdout.write(`${JSON.stringify({ verdict: "pass", sha256: model.digests?.["review.diagram.json"] })}
`);
}
main().catch((error) => {
  process.stderr.write(`[diagram-project-review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

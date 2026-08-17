import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AESTHETIC_CRITERIA, REVIEW_CHECKS, REVIEW_INPUT_SCHEMA, SKILL_ADVICE_INPUT_SCHEMA, computeLogoSubjectDigest, reviewArtifactPaths, validateLogoModel } from "../src/lib/contract.js";
import { issueWriterCapability } from "../src/lib/capability.js";
import { loadLogoProject } from "../src/lib/project.js";
import { validLogoModel, writeModel } from "./helpers/logo-fixture.js";

const ADVICE_ENTRY = fileURLToPath(new URL("../dist/cli/project-advice.mjs", import.meta.url));
const REVIEW_ENTRY = fileURLToPath(new URL("../dist/cli/project-review.mjs", import.meta.url));

function run(entry: string, args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("advice writer admits one selected current-source worker result and consumes its capability", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "logo-advice-"));
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  const input = join(sandbox, "advice.json");
  try {
    const model = validLogoModel({ stage: "source" });
    const composition = JSON.parse(String(model.files["plan.skill-composition.json"]));
    composition.workers[0].status = "used";
    composition.workers[0].reason = "brief needs an external visual-identity pass";
    model.files["plan.skill-composition.json"] = JSON.stringify(composition);
    await writeModel(project, model);
    const loaded = await loadLogoProject(project);
    const subjectDigest = computeLogoSubjectDigest(loaded);
    await writeFile(input, JSON.stringify({ schema: SKILL_ADVICE_INPUT_SCHEMA, artifactId: loaded.artifactId, subjectDigest, skillName: "logo-brand-direction", ecosystem: "bilingual", mode: "adviser", phase: "brief", summary: "Clarified a distinctive geometric positioning.", recommendations: ["Use one orbital memory point"], adopted: ["Use one orbital memory point"], rejected: [] }));
    await issueWriterCapability({ root: project, capability: "logo-advice", argv: [ADVICE_ENTRY, project, input], subjectDigest, sessionId: "advice-session" });
    const admitted = await run(ADVICE_ENTRY, [project, input]);
    assert.equal(admitted.code, 0, admitted.stderr);
    assert.equal(JSON.parse(admitted.stdout).skillName, "logo-brand-direction");
    assert.equal(validateLogoModel(await loadLogoProject(project), { stage: "source" }).length, 0);
    const replay = await run(ADVICE_ENTRY, [project, input]);
    assert.equal(replay.code, 2);
    assert.match(replay.stderr, /WRITER_CAPABILITY_MISSING/u);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});

test("review writer requires an independent session and complete current-hash coverage", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "logo-review-"));
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  const input = join(sandbox, "review.json");
  try {
    const model = validLogoModel();
    delete model.files["review.logo.json"];
    delete model.files["release.manifest.json"];
    delete model.files["receipt.release.json"];
    await writeModel(project, model);
    const loaded = await loadLogoProject(project);
    const subjectDigest = computeLogoSubjectDigest(loaded);
    const coverage = reviewArtifactPaths(loaded).map((path) => ({ path, sha256: loaded.digests[path] }));
    const payload = {
      schema: REVIEW_INPUT_SCHEMA, artifactId: loaded.artifactId, subjectDigest, decision: "approved",
      reviewer: { kind: "independent-agent", id: "logo-reviewer", sessionId: "review-session" },
      coverage,
      checks: REVIEW_CHECKS.map((id) => ({ id, status: "pass" })),
      criteria: Object.fromEntries(AESTHETIC_CRITERIA.map((id) => [id, { score: 2, requiredMin: 2, note: `${id} has substantive visual evidence` }])),
      findings: [{ findingId: "visual-001", severity: "major", evidenceAnchor: coverage[0].path, artifactDigest: coverage[0].sha256, fix: "adjusted and rerendered", status: "verified", recheckEvidence: "current digest rechecked" }],
    };
    await writeFile(input, JSON.stringify(payload));
    await issueWriterCapability({ root: project, capability: "logo-review", argv: [REVIEW_ENTRY, project, input], subjectDigest, sessionId: "review-session" });
    const reviewed = await run(REVIEW_ENTRY, [project, input]);
    assert.equal(reviewed.code, 0, reviewed.stderr);
    const admitted = JSON.parse(await readFile(join(project, "review.logo.json"), "utf8"));
    assert.equal(admitted.reviewer.sessionId, "review-session");
    assert.equal(admitted.findings[0].status, "verified");

    payload.findings[0].artifactDigest = "0".repeat(64);
    await writeFile(input, JSON.stringify(payload));
    await issueWriterCapability({ root: project, capability: "logo-review", argv: [REVIEW_ENTRY, project, input], subjectDigest, sessionId: "review-session" });
    const forgedFinding = await run(REVIEW_ENTRY, [project, input]);
    assert.equal(forgedFinding.code, 2);
    assert.match(forgedFinding.stderr, /REVIEW_FINDING_DIGEST_MISMATCH/u);

    payload.findings[0].artifactDigest = coverage[0].sha256;
    payload.criteria.singleMemoryPoint = { score: 0, requiredMin: 0, note: "threshold was improperly lowered" };
    await writeFile(input, JSON.stringify(payload));
    await issueWriterCapability({ root: project, capability: "logo-review", argv: [REVIEW_ENTRY, project, input], subjectDigest, sessionId: "review-session" });
    const loweredThreshold = await run(REVIEW_ENTRY, [project, input]);
    assert.equal(loweredThreshold.code, 2);
    assert.match(loweredThreshold.stderr, /REVIEW_CRITERIA_INCOMPLETE/u);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});

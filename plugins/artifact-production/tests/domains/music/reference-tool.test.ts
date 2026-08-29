import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueMusicWriterCapability } from "../../../src/domains/music/lib/capability.js";
import { computeMusicSubjectDigest } from "../../../src/domains/music/lib/contract.js";
import { collectMusicModel } from "../../../src/domains/music/lib/release.js";

const ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function run(argv: string[]) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stderr }));
  });
}

const sources = {
  schema: "music-production/reference-sources-input/v1",
  artifactId: "study",
  references: [
    { id: "r1", artist: "Example Artist", title: "First Track", observationBasis: "auditioned" },
    { id: "r2", artist: "Example Artist", title: "Second Track", observationBasis: "auditioned" },
    { id: "r3", artist: "Example Artist", title: "Third Track", observationBasis: "documented-analysis" },
  ],
};

function profile(briefSha256: string, sourceSetSha256: string) {
  const trait = (text: string) => [{ trait: text, basis: "observed", referenceIds: ["r1", "r2"] }];
  return {
    schema: "music-production/reference-profile-input/v1",
    artifactId: "study",
    briefSha256,
    sourceSetSha256,
    skillName: "music-reference-profile",
    ecosystem: "en",
    mode: "reference-only",
    phase: "reference-analysis",
    dimensions: {
      rhythmicFoundation: trait("syncopated eighth-note pulse"),
      harmonicArchitecture: trait("slow functional harmonic rhythm"),
      instrumentalTechniques: trait("short synthesized attacks"),
      productionAesthetics: trait("dry center with a restrained stereo tail"),
      genreFusion: trait("electronic pulse with pop phrasing"),
      energyArchitecture: trait("gradual density lift into the final phrase"),
    },
    descriptors: ["syncopated pulse", "slow harmonic rhythm", "short attacks", "dry center", "restrained stereo tail"],
    toneJsMapping: {
      rhythmAndTempo: ["eighth-note syncopation at a steady tempo"],
      harmonyAndVoicing: ["one chord per bar with close upper voices"],
      timbreAndEffects: ["short synth envelope and restrained delay"],
      spaceAndDynamics: ["centered lead with a narrow dynamic rise"],
      formAndEnergy: ["add one supporting layer in the final phrase"],
    },
    unsupportedTraits: [{ trait: "live pick articulation", reason: "v1 uses local synthesis only" }],
    antiImitation: { artistNamesRemoved: true, signatureMaterialExcluded: true, imitationPromptExcluded: true },
  };
}

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "music-reference-"));
  const root = join(parent, "artifacts", "music", "study");
  const sourcesPath = join(parent, "sources.json");
  const profilePath = join(parent, "profile.json");
  await mkdir(root, { recursive: true });
  const sourceBytes = `${JSON.stringify(sources, null, 2)}\n`;
  const sourceSetSha256 = sha256(sourceBytes);
  const brief = {
    schema: "music-production/brief/v2",
    artifactId: "study",
    language: "en",
    audience: "listeners",
    useCase: "cue",
    durationSeconds: 8,
    mood: "bright",
    genre: "electronic",
    reference: { mode: "source-analysis", sourceSetSha256 },
    referenceTraits: [],
    structure: ["main"],
    instrumentation: ["lead"],
    constraints: ["synth only"],
    prohibitedDirections: ["copying"],
    successCriteria: ["clear motif"],
  };
  const briefBytes = `${JSON.stringify(brief, null, 2)}\n`;
  const briefSha256 = sha256(briefBytes);
  await writeFile(sourcesPath, sourceBytes);
  await writeFile(join(root, "plan.brief.json"), briefBytes);
  await writeFile(join(root, "music.project.json"), JSON.stringify({ schema: "music-production/project/v1", artifactId: "study", tracks: [] }));
  await writeFile(join(root, "plan.skill-composition.json"), JSON.stringify({
    schema: "music-production/skill-composition/v2",
    artifactId: "study",
    workers: [
      { name: "music-composition-method", ecosystem: "en", mode: "adviser", artifactKind: "advice", status: "skipped", reason: "fixture" },
      { name: "music-genre-reference", ecosystem: "zh", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "fixture" },
      { name: "music-reference-profile", ecosystem: "en", mode: "reference-only", artifactKind: "reference-profile", status: "used", reason: "source analysis required", evidencePath: `evidence/reference-profile.${briefSha256}.json` },
      { name: "music-mix-qc", ecosystem: "en", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "fixture" },
    ],
  }));
  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  const argv = [ENTRY, "music", "reference", root, sourcesPath, profilePath];
  return { parent, root, sourcesPath, profilePath, briefSha256, sourceSetSha256, subjectDigest, argv };
}

test("writes a name-free structured reference profile bound to the brief and source manifest", async () => {
  const state = await fixture();
  try {
    const payload = profile(state.briefSha256, state.sourceSetSha256);
    Object.assign(payload.dimensions.rhythmicFoundation[0], { sourceUrl: "https://example.invalid/private-reference" });
    await writeFile(state.profilePath, JSON.stringify(payload));
    await issueMusicWriterCapability({ root: state.root, capability: "music-reference", argv: state.argv, subjectDigest: state.subjectDigest, sessionId: "reference-session", triggerFrom: "test" });
    const result = await run(state.argv);
    assert.equal(result.code, 0, result.stderr);
    const evidence = await readFile(join(state.root, "evidence", `reference-profile.${state.briefSha256}.json`), "utf8");
    assert.doesNotMatch(evidence, /Example Artist|First Track/iu);
    assert.doesNotMatch(evidence, /example\.invalid/iu);
    assert.equal(JSON.parse(evidence).sessionId, "reference-session");
  } finally {
    await rm(state.parent, { recursive: true, force: true });
  }
});

test("rejects a reference profile that leaks a source artist identity", async () => {
  const state = await fixture();
  try {
    const payload = profile(state.briefSha256, state.sourceSetSha256);
    payload.descriptors[0] = "Example Artist syncopation";
    await writeFile(state.profilePath, JSON.stringify(payload));
    await issueMusicWriterCapability({ root: state.root, capability: "music-reference", argv: state.argv, subjectDigest: state.subjectDigest, sessionId: "reference-session", triggerFrom: "test" });
    const result = await run(state.argv);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /REFERENCE_IDENTITY_LEAK/u);
  } finally {
    await rm(state.parent, { recursive: true, force: true });
  }
});

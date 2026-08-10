import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PROFILE_WEIGHTS, euclideanPattern, optimizeComposition } from "../scripts/lib/music-math.mjs";

const SIMPLE_COMPOSITION = {
  schema: "tonejs-composition/v1",
  id: "four-chord-study",
  title: "Four Chord Study",
  bpm: 120,
  timeSignature: [4, 4],
  bars: 4,
  seed: 7,
  profile: "pop-electronic",
  sections: [
    {
      id: "main",
      startBar: 0,
      bars: 4,
      key: "C",
      mode: "major",
      chords: [1, 5, 6, 4],
      energy: 0.7,
    },
  ],
  motifs: [
    {
      id: "hook",
      degrees: [0, 2, 4, 2],
      rhythmTicks: [960, 960, 960, 960],
    },
  ],
  tracks: [
    {
      id: "lead",
      role: "melody",
      instrument: "src/instruments/lead.mjs",
      motif: "hook",
      octave: 4,
      sections: ["main"],
    },
  ],
};

test("optimizes a valid composition into deterministic integer-tick events", () => {
  const first = optimizeComposition(SIMPLE_COMPOSITION);
  const second = optimizeComposition(SIMPLE_COMPOSITION);

  assert.deepEqual(first, second);
  assert.equal(first.schema, "tonejs-symbolic-score/v1");
  assert.equal(first.ppq, 960);
  assert.equal(first.hardViolations.length, 0);
  assert.ok(first.tracks[0].events.every(({ startTick, durationTick }) => Number.isInteger(startTick) && Number.isInteger(durationTick)));
});

test("distributes three Euclidean pulses across eight steps", () => {
  assert.deepEqual(euclideanPattern(3, 8), [1, 0, 0, 1, 0, 0, 1, 0]);
});

test("selects the highest-scoring candidate from a bounded deterministic search", () => {
  const score = optimizeComposition(SIMPLE_COMPOSITION);
  const totals = score.candidateSummaries.map(({ overall }) => overall);

  assert.ok(score.candidatesEvaluated > 1 && score.candidatesEvaluated <= 128);
  assert.equal(score.metrics.overall, Math.max(...totals));
  assert.equal(score.selectedCandidateId, score.candidateSummaries.find(({ selected }) => selected).id);
});

test("uses normalized, bounded objective profiles", () => {
  for (const weights of Object.values(PROFILE_WEIGHTS)) {
    assert.ok(Object.values(weights).every((weight) => weight >= 0 && weight <= 1));
    assert.ok(Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
  }
});

test("keeps published profile assets identical to executable weights", async () => {
  for (const [name, weights] of Object.entries(PROFILE_WEIGHTS)) {
    const fileUrl = new URL(`../skills/tonejs-music-production/assets/profiles/${name}.json`, import.meta.url);
    assert.deepEqual(JSON.parse(await readFile(fileUrl, "utf8")), weights);
  }
});

test("rejects fractional scale degrees before they can serialize as null MIDI", () => {
  const invalid = structuredClone(SIMPLE_COMPOSITION);
  invalid.motifs[0].degrees[0] = 0.5;
  assert.throws(() => optimizeComposition(invalid), /MOTIF_INVALID/u);
});

test("rejects non-finite section energy instead of emitting null velocity and score", () => {
  const invalid = structuredClone(SIMPLE_COMPOSITION);
  invalid.sections[0].energy = Number.NaN;
  assert.throws(() => optimizeComposition(invalid), /SECTION_INVALID/u);
});

test("deduplicates musically identical transformations before assigning novelty", () => {
  const singleNote = structuredClone(SIMPLE_COMPOSITION);
  singleNote.motifs[0].degrees = [0];
  singleNote.motifs[0].rhythmTicks = [960];
  const score = optimizeComposition(singleNote);
  assert.equal(score.candidatesEvaluated, 1);
  assert.equal(score.metrics.controlledNovelty, 0);
});

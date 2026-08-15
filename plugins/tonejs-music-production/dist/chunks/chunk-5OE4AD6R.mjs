// harness-source-hash: sha256:f39458424842356a20167de1a7109c0fb792bb5e954cf4b9eb7faaa6aa35f2fa
import {
  MUSIC_ENGINE
} from "./chunk-XYNVSRBJ.mjs";

// plugins/tonejs-music-production/src/lib/composition-loader.ts
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
var CHILD_SOURCE = `import { pathToFileURL } from "node:url";
const loaded = await import(pathToFileURL(process.argv[1]).href);
process.stdout.write(JSON.stringify(loaded.default));`;
function loadOnce(root) {
  return new Promise((resolvePromise, reject) => {
    const compositionPath = join(root, "src", "composition.mjs");
    const child = spawn(process.execPath, [
      "--no-warnings",
      "--experimental-permission",
      `--allow-fs-read=${root}`,
      "--input-type=module",
      "--eval",
      CHILD_SOURCE,
      compositionPath
    ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 1e4);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 2 * 1024 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`COMPOSITION_LOAD_FAILED:${signal ?? code}:${stderr.trim().slice(0, 500)}`));
        return;
      }
      try {
        resolvePromise({ raw: stdout, value: JSON.parse(stdout) });
      } catch {
        reject(new Error("COMPOSITION_LOAD_FAILED:default export must be silent and JSON-serializable"));
      }
    });
  });
}
async function loadCompositionDeterministic(inputRoot) {
  const root = resolve(inputRoot);
  const [first, second] = await Promise.all([loadOnce(root), loadOnce(root)]);
  if (first.raw !== second.raw) throw new Error("COMPOSITION_NONDETERMINISTIC");
  return first.value;
}

// plugins/tonejs-music-production/src/lib/music-math.ts
import { createHash } from "node:crypto";
var PPQ = 960;
var PITCH_CLASSES = /* @__PURE__ */ new Map([
  ["C", 0],
  ["C#", 1],
  ["Db", 1],
  ["D", 2],
  ["D#", 3],
  ["Eb", 3],
  ["E", 4],
  ["F", 5],
  ["F#", 6],
  ["Gb", 6],
  ["G", 7],
  ["G#", 8],
  ["Ab", 8],
  ["A", 9],
  ["A#", 10],
  ["Bb", 10],
  ["B", 11]
]);
var MODE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};
var PROFILE_WEIGHTS = {
  "tonal-classical": {
    harmonicCoherence: 0.25,
    voiceLeading: 0.24,
    rhythmicFit: 0.1,
    motifCoherence: 0.14,
    structuralArc: 0.14,
    registerSeparation: 0.09,
    controlledNovelty: 0.04
  },
  "pop-electronic": {
    harmonicCoherence: 0.22,
    voiceLeading: 0.18,
    rhythmicFit: 0.16,
    motifCoherence: 0.14,
    structuralArc: 0.14,
    registerSeparation: 0.1,
    controlledNovelty: 0.06
  },
  "ambient-cinematic": {
    harmonicCoherence: 0.18,
    voiceLeading: 0.16,
    rhythmicFit: 0.08,
    motifCoherence: 0.14,
    structuralArc: 0.24,
    registerSeparation: 0.14,
    controlledNovelty: 0.06
  }
};
var clamp01 = (value) => Math.max(0, Math.min(1, value));
var digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function assertComposition(spec) {
  if (spec?.schema !== "tonejs-composition/v1") throw new Error("COMPOSITION_SCHEMA_INVALID");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(spec?.id ?? "")) throw new Error("COMPOSITION_ID_INVALID");
  if (!Number.isFinite(spec?.bpm) || spec.bpm < 20 || spec.bpm > 300) throw new Error("BPM_INVALID");
  if (!Number.isInteger(spec?.bars) || spec.bars <= 0) throw new Error("BARS_INVALID");
  if (!Number.isInteger(spec?.seed)) throw new Error("SEED_INVALID");
  if (!Array.isArray(spec?.timeSignature) || spec.timeSignature.length !== 2 || !Number.isInteger(spec.timeSignature[0]) || spec.timeSignature[0] < 1 || spec.timeSignature[0] > 16 || ![1, 2, 4, 8, 16].includes(spec.timeSignature[1])) throw new Error("TIME_SIGNATURE_INVALID");
  if (!(spec.profile in PROFILE_WEIGHTS)) throw new Error("PROFILE_INVALID");
  if (!Array.isArray(spec.sections) || spec.sections.length === 0 || spec.sections.some((section) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(section.id ?? "") || !Number.isInteger(section.startBar) || !Number.isInteger(section.bars) || section.startBar < 0 || section.bars <= 0 || section.startBar + section.bars > spec.bars || !Number.isFinite(section.energy) || section.energy < 0 || section.energy > 1 || !Array.isArray(section.chords) || section.chords.length === 0 || section.chords.some((degree) => !Number.isInteger(degree) || degree < 1 || degree > 7) || !PITCH_CLASSES.has(section.key) || !(section.mode in MODE_INTERVALS))) throw new Error("SECTION_INVALID");
  const sortedSections = spec.sections.toSorted((left, right) => left.startBar - right.startBar);
  if (new Set(spec.sections.map(({ id }) => id)).size !== spec.sections.length || sortedSections.some((section, index) => index > 0 && section.startBar < sortedSections[index - 1].startBar + sortedSections[index - 1].bars)) throw new Error("SECTION_INVALID");
  if (!Array.isArray(spec.motifs) || spec.motifs.length === 0 || spec.motifs.some((motif) => !Array.isArray(motif.degrees) || motif.degrees.length === 0 || motif.degrees.some((degree) => !Number.isInteger(degree) || degree < -28 || degree > 28) || !Array.isArray(motif.rhythmTicks) || motif.rhythmTicks.length !== motif.degrees.length || motif.rhythmTicks.some((ticks) => !Number.isInteger(ticks) || ticks <= 0)) || new Set(spec.motifs.map(({ id }) => id)).size !== spec.motifs.length) throw new Error("MOTIF_INVALID");
  if (!Array.isArray(spec.tracks) || spec.tracks.length === 0 || spec.tracks.length > 8 || spec.tracks.some((track) => !Number.isInteger(track.octave) || track.octave < -1 || track.octave > 9) || new Set(spec.tracks.map(({ id }) => id)).size !== spec.tracks.length) throw new Error("TRACK_INVALID");
  const durationSeconds = spec.bars * spec.timeSignature[0] * (4 / spec.timeSignature[1]) * 60 / spec.bpm;
  if (durationSeconds > 180) throw new Error("DURATION_LIMIT_EXCEEDED");
}
function ticksPerBar([numerator, denominator]) {
  const value = PPQ * numerator * (4 / denominator);
  if (!Number.isInteger(value) || value <= 0) throw new Error("TIME_SIGNATURE_INVALID");
  return value;
}
function degreeToMidi({ degree, key, mode, octave }) {
  const tonic = PITCH_CLASSES.get(key);
  const intervals = MODE_INTERVALS[mode];
  if (tonic === void 0 || !intervals) throw new Error("TONALITY_INVALID");
  const scaleLength = intervals.length;
  const octaveOffset = Math.floor(degree / scaleLength);
  const normalizedDegree = (degree % scaleLength + scaleLength) % scaleLength;
  return 12 * (octave + 1 + octaveOffset) + tonic + intervals[normalizedDegree];
}
function eventsForTrack(spec, track, motifById, sectionById, barTicks) {
  const motif = motifById.get(track.motif);
  if (!motif) throw new Error(`MOTIF_NOT_FOUND:${track.motif}`);
  if (motif.degrees.length !== motif.rhythmTicks.length || motif.degrees.length === 0) throw new Error(`MOTIF_INVALID:${motif.id}`);
  const events = [];
  for (const sectionId of track.sections) {
    const section = sectionById.get(sectionId);
    if (!section) throw new Error(`SECTION_NOT_FOUND:${sectionId}`);
    const sectionStart = section.startBar * barTicks;
    const sectionEnd = sectionStart + section.bars * barTicks;
    let cursor = sectionStart;
    let motifIndex = 0;
    while (cursor < sectionEnd) {
      const position = motifIndex % motif.degrees.length;
      const durationTick = motif.rhythmTicks[position];
      if (!Number.isInteger(durationTick) || durationTick <= 0) throw new Error(`RHYTHM_INVALID:${motif.id}`);
      if (cursor + durationTick > sectionEnd) break;
      events.push({
        startTick: cursor,
        durationTick,
        midi: degreeToMidi({ degree: motif.degrees[position], key: section.key, mode: section.mode, octave: track.octave }),
        velocity: Math.round(64 + 48 * clamp01(section.energy)),
        voice: track.id,
        sectionId,
        chordDegree: section.chords[Math.floor((cursor - sectionStart) / barTicks) % section.chords.length]
      });
      cursor += durationTick;
      motifIndex += 1;
    }
  }
  return events;
}
function mean(values, fallback = 1) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}
function chordPitchClasses(section, chordDegree) {
  const tonic = PITCH_CLASSES.get(section.key);
  const scale = MODE_INTERVALS[section.mode];
  if (tonic === void 0 || !scale || !Number.isInteger(chordDegree)) return /* @__PURE__ */ new Set();
  const root = chordDegree - 1;
  return new Set([root, root + 2, root + 4].map((degree) => {
    const octave = Math.floor(degree / scale.length);
    return (tonic + scale[(degree % scale.length + scale.length) % scale.length] + octave * 12) % 12;
  }));
}
function scoreVector(spec, tracks, novelty) {
  const events = tracks.flatMap((track) => track.events);
  const sections = new Map(spec.sections.map((section) => [section.id, section]));
  const harmonic = events.map((event) => chordPitchClasses(sections.get(event.sectionId), event.chordDegree).has(event.midi % 12) ? 1 : 0.6);
  const voiceLeading = tracks.map((track) => mean(track.events.slice(1).map((event, index) => {
    const interval = Math.abs(event.midi - track.events[index].midi);
    return 1 / (1 + Math.max(0, interval - 2) / 12);
  })));
  const grid = PPQ / 4;
  const rhythmic = events.map((event) => event.startTick % grid === 0 && event.durationTick % grid === 0 ? 1 : 0);
  const motifScores = spec.tracks.map((sourceTrack) => {
    const track = tracks.find((item) => item.id === sourceTrack.id);
    const motifLength = spec.motifs.find((motif) => motif.id === sourceTrack.motif)?.degrees.length ?? 0;
    if (!track || motifLength <= 0 || track.events.length <= motifLength) return 1;
    return mean(track.events.slice(motifLength).map((event, index) => event.midi % 12 === track.events[index].midi % 12 && event.durationTick === track.events[index].durationTick ? 1 : 0));
  });
  const occupiedTicks = events.reduce((sum, event) => sum + event.durationTick, 0);
  const totalTicks = ticksPerBar(spec.timeSignature) * spec.bars * Math.max(1, tracks.length);
  const density = clamp01(occupiedTicks / totalTicks);
  const energySmoothness = mean(spec.sections.slice(1).map((section, index) => 1 - clamp01(Math.abs(section.energy - spec.sections[index].energy))));
  const coverage = clamp01(spec.sections.reduce((sum, section) => sum + section.bars, 0) / spec.bars);
  const centers = tracks.map((track) => mean(track.events.map((event) => event.midi), 60));
  const separations = centers.flatMap((center, index) => centers.slice(index + 1).map((other) => clamp01(Math.abs(center - other) / 12)));
  return {
    harmonicCoherence: clamp01(mean(harmonic)),
    voiceLeading: clamp01(mean(voiceLeading)),
    rhythmicFit: clamp01(0.7 * mean(rhythmic) + 0.3 * density),
    motifCoherence: clamp01(mean(motifScores)),
    structuralArc: clamp01((energySmoothness + coverage) / 2),
    registerSeparation: clamp01(mean(separations)),
    controlledNovelty: clamp01(novelty)
  };
}
function weightedScore(vector, weights) {
  return Object.entries(weights).reduce((total, [key, weight]) => total + vector[key] * weight, 0);
}
function optimizeComposition(spec) {
  assertComposition(spec);
  const barTicks = ticksPerBar(spec.timeSignature);
  const sectionById = new Map(spec.sections.map((section) => [section.id, section]));
  const baseMotifs = spec.motifs.map((motif) => ({ ...motif, degrees: [...motif.degrees] }));
  const variantCount = Math.max(2, Math.min(8, Math.max(...baseMotifs.map((motif) => motif.degrees.length))));
  const generatedCandidates = Array.from({ length: variantCount }, (_, variantIndex) => {
    const motifs = baseMotifs.map((motif) => {
      const rotation = variantIndex % motif.degrees.length;
      const degrees = [...motif.degrees.slice(rotation), ...motif.degrees.slice(0, rotation)];
      return { ...motif, degrees: variantIndex === variantCount - 1 ? degrees.toReversed() : degrees };
    });
    const motifById = new Map(motifs.map((motif) => [motif.id, motif]));
    const tracks = spec.tracks.map((track) => ({
      id: track.id,
      role: track.role,
      instrument: track.instrument,
      events: eventsForTrack(spec, track, motifById, sectionById, barTicks)
    }));
    const hardViolations = tracks.flatMap((track) => track.events.filter((event) => Object.values(event).some((value) => typeof value === "number" && !Number.isFinite(value)) || event.startTick < 0 || event.startTick + event.durationTick > spec.bars * barTicks || event.midi < 0 || event.midi > 127 || event.velocity < 0 || event.velocity > 127).map(() => ({ code: "EVENT_OUT_OF_RANGE", trackId: track.id })));
    if (tracks.every((track) => track.events.length === 0)) hardViolations.push({ code: "COMPOSITION_SILENT" });
    const noveltyValues = motifs.flatMap((motif, motifIndex) => motif.degrees.map((degree, degreeIndex) => clamp01(Math.abs(degree - baseMotifs[motifIndex].degrees[degreeIndex]) / 7)));
    const metrics = scoreVector(spec, tracks, mean(noveltyValues, 0));
    const overall = weightedScore(metrics, PROFILE_WEIGHTS[spec.profile]);
    const contentDigest = digest(tracks);
    const id = digest({ seed: spec.seed, contentDigest, profile: spec.profile }).slice(0, 16);
    return { id, contentDigest, tracks, hardViolations, metrics: { ...metrics, overall } };
  });
  const candidates = generatedCandidates.filter((candidate, index) => generatedCandidates.findIndex((item) => item.contentDigest === candidate.contentDigest) === index);
  const eligible = candidates.filter((candidate) => candidate.hardViolations.length === 0);
  if (eligible.length === 0) throw new Error("NO_VALID_CANDIDATE");
  eligible.sort((left, right) => right.metrics.overall - left.metrics.overall || left.id.localeCompare(right.id));
  const selected = eligible[0];
  return {
    schema: "tonejs-symbolic-score/v1",
    engine: MUSIC_ENGINE,
    compositionId: spec.id,
    ppq: PPQ,
    bpm: spec.bpm,
    timeSignature: spec.timeSignature,
    bars: spec.bars,
    seed: spec.seed,
    profile: spec.profile,
    selectedCandidateId: selected.id,
    candidatesEvaluated: candidates.length,
    candidateSummaries: candidates.map((candidate) => ({
      id: candidate.id,
      hardViolationCount: candidate.hardViolations.length,
      overall: candidate.metrics.overall,
      selected: candidate.id === selected.id
    })),
    hardViolations: selected.hardViolations,
    metrics: selected.metrics,
    tracks: selected.tracks,
    canonicalDigest: digest({ spec, tracks: selected.tracks, metrics: selected.metrics })
  };
}

export {
  loadCompositionDeterministic,
  optimizeComposition
};

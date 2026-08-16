#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { consumeMusicWriterCapability, processMusicWriterArgv } from "../../lib/capability.js";

const args = process.argv.slice(2);
const root = resolve(args[0] ?? "");
const id = basename(root);
const skipInstall = args.includes("--skip-install");
const installBrowser = args.includes("--install-browser");

function run(command: string, commandArgs: readonly string[], cwd: string, timeoutMs = 180000) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: "inherit" });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`COMMAND_TIMEOUT:${command}`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`COMMAND_FAILED:${command}:${code}`));
    });
  });
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) throw new Error("music id must be kebab-case");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-init", argv: processMusicWriterArgv() });
  const expectedSubject = createHash("sha256").update(`music-project-delivery-guard@0.4.0\ninit\0${root}`).digest("hex");
  if (grant.subjectDigest !== expectedSubject) throw new Error("WRITER_SUBJECT_CHANGED");
  process.env.AI_EXPERTS_SESSION_ID = grant.sessionId;
  const existing = (await readdir(root)).filter((name) => name !== ".tmp");
  if (existing.length > 0) throw new Error("PROJECT_ROOT_NOT_EMPTY");
  const instrumentsRoot = join(root, "src", "instruments");
  await mkdir(instrumentsRoot, { recursive: true });
  await Promise.all([
    writeFile(join(root, ".gitignore"), "node_modules/\n.cache/\n.tmp/\n", { flag: "wx" }),
    writeJson(join(root, "package.json"), {
      name: `music-project-${id}`,
      version: "0.4.0",
      private: true,
      type: "module",
    }),
    writeJson(join(root, "plan.contract.json"), {
      schema: "music-project-delivery-guard/plan/v1",
      artifactId: id,
      targetStage: "source",
    }),
    writeJson(join(root, "plan.brief.json"), {
      schema: "music-project-delivery-guard/brief/v2",
      artifactId: id,
      language: "en",
      audience: "general listeners",
      useCase: "short instrumental cue",
      durationSeconds: 8,
      mood: "focused and optimistic",
      genre: "electronic pop",
      reference: { mode: "traits" },
      referenceTraits: ["clear four-bar hook"],
      structure: ["main"],
      instrumentation: ["synth lead"],
      constraints: ["Tone.js synthesis only"],
      prohibitedDirections: ["copyrighted melody imitation"],
      successCriteria: ["recognizable motif", "clean loop ending"],
    }),
    writeJson(join(root, "plan.direction.json"), {
      schema: "music-project-delivery-guard/direction/v1",
      artifactId: id,
      tonalCenter: "C major",
      tempo: "120 BPM",
      meter: "4/4",
      coreMotif: "ascending triad with stepwise return",
      soundPalette: ["triangle synth lead"],
      rationale: "A compact consonant palette supports a clear reusable cue.",
    }),
    writeJson(join(root, "plan.arrangement.json"), {
      schema: "music-project-delivery-guard/arrangement/v1",
      artifactId: id,
      sections: [{ id: "main", bars: 4, energy: 0.7 }],
      instrumentRoles: [{ trackId: "lead", role: "melody", register: "mid" }],
      dynamicsIntent: "Stable body with transient headroom.",
      spaceIntent: "Centered lead with restrained release tail.",
      mixIntent: "Intelligible melody without clipping or DC offset.",
    }),
    writeJson(join(root, "plan.skill-composition.json"), {
      schema: "music-project-delivery-guard/skill-composition/v2",
      artifactId: id,
      workers: [
        { name: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", artifactKind: "advice", status: "skipped", reason: "Select when external composition advice is needed." },
        { name: "miaoxiang-music", revision: "1447ff68be4a544a61354377592f345a9216ff1f", ecosystem: "zh", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "Select for Chinese-ecosystem genre or scene vocabulary." },
        { name: "musical-dna", revision: "e02ec7e226a6e4f8419fd3b88a1d8e472d421b32", ecosystem: "en", mode: "reference-only", artifactKind: "reference-profile", status: "skipped", reason: "Required only when reference.mode is source-analysis." },
        { name: "workflow-audio-production", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "Select for arrangement, mix, or preview guidance." },
        { name: "workflow-analysis-quality", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "Select in the independent review phase for audio QC guidance." }
      ],
    }),
    writeJson(join(root, "music.project.json"), {
      schema: "music-project-delivery-guard/project/v1",
      artifactId: id,
      sampleRate: 48000,
      channels: 2,
      tailSeconds: 1,
      quality: {
        maxPeakDbfs: -0.5,
        minRmsDbfs: -60,
        maxAbsDcOffset: 0.01,
        maxClippedSamples: 0,
      },
      tracks: [
        {
          index: 1,
          id: "lead",
          role: "melody",
          instrument: "src/instruments/lead.mjs",
        },
      ],
    }),
    writeFile(join(root, "src", "composition.mjs"), `export default {
  schema: "tonejs-composition/v1",
  id: "${id}",
  title: "${id.split("-").map((part) => `${part[0] ?? ""}`.toUpperCase() + part.slice(1)).join(" ")}",
  bpm: 120,
  timeSignature: [4, 4],
  bars: 4,
  seed: 7,
  profile: "pop-electronic",
  sections: [
    { id: "main", startBar: 0, bars: 4, key: "C", mode: "major", chords: [1, 5, 6, 4], energy: 0.7 },
  ],
  motifs: [
    { id: "hook", degrees: [0, 2, 4, 2], rhythmTicks: [960, 960, 960, 960] },
  ],
  tracks: [
    { id: "lead", role: "melody", instrument: "src/instruments/lead.mjs", motif: "hook", octave: 4, sections: ["main"] },
  ],
};
`, { flag: "wx" }),
    writeFile(join(instrumentsRoot, "lead.mjs"), `export function createInstrument({ Tone, output }) {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.3 },
  }).connect(output);
}
`, { flag: "wx" }),
  ]);
  if (!skipInstall) {
    await run("npm", ["install", "--save-exact", "tone@15.1.22", "tonal@6.4.3"], root);
    await run("npm", ["install", "--save-dev", "--save-exact", "playwright@1.62.1", "esbuild@0.28.2", "eslint@9.39.2"], root);
    if (installBrowser) await run("npx", ["playwright", "install", "chromium"], root, 300000);
  }
  process.stdout.write(`${JSON.stringify({ root, installed: !skipInstall, browserInstalled: !skipInstall && installBrowser })}\n`);
}

main().catch((error: unknown) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-init] ${message}\n`);
  process.exitCode = 2;
});

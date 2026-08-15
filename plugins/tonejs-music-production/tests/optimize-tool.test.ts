import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-optimize.mjs", import.meta.url));

async function run(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, root], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

test("writes digest-named symbolic score and metrics through the optimizer CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "tonejs-optimize-"));
  try {
    await mkdir(join(root, "src", "instruments"), { recursive: true });
    await Promise.all([
      writeFile(join(root, ".gitignore"), "node_modules/\n.cache/\n.tmp/\n"),
      writeFile(join(root, "package.json"), "{}\n"),
      writeFile(join(root, "package-lock.json"), "{}\n"),
      writeFile(join(root, "plan.contract.json"), JSON.stringify({ targetStage: "source" })),
      writeFile(join(root, "music.project.json"), JSON.stringify({
        schema: "tonejs-music-project/v1",
        artifactId: "study",
        sampleRate: 48000,
        channels: 2,
        tracks: [{ index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" }],
      })),
      writeFile(join(root, "src", "instruments", "lead.mjs"), "export function createInstrument() {}\n"),
      writeFile(join(root, "src", "composition.mjs"), `export default ${JSON.stringify({
        schema: "tonejs-composition/v1",
        id: "study",
        title: "Study",
        bpm: 120,
        timeSignature: [4, 4],
        bars: 1,
        seed: 3,
        profile: "pop-electronic",
        sections: [{ id: "main", startBar: 0, bars: 1, key: "C", mode: "major", chords: [1], energy: 0.5 }],
        motifs: [{ id: "hook", degrees: [0], rhythmTicks: [960] }],
        tracks: [{ id: "lead", role: "melody", instrument: "src/instruments/lead.mjs", motif: "hook", octave: 4, sections: ["main"] }],
      })};\n`),
    ]);

    const result = await run(root);
    assert.equal(result.code, 0, result.stderr);
    const names = await readdir(join(root, "build"));
    assert.equal(names.filter((name) => /^score\.[a-f0-9]{64}\.json$/u.test(name)).length, 1);
    assert.equal(names.filter((name) => /^metrics\.[a-f0-9]{64}\.json$/u.test(name)).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

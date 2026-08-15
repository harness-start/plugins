#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const id = args[0] ?? "";
const workspaceIndex = args.indexOf("--workspace");
const workspace = resolve(workspaceIndex >= 0 ? args[workspaceIndex + 1] : process.cwd());
const skipInstall = args.includes("--skip-install");
const installBrowser = args.includes("--install-browser");

function run(command, commandArgs, cwd, timeoutMs = 180000) {
  return new Promise((resolvePromise, reject) => {
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

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) throw new Error("music id must be kebab-case");
  const root = join(workspace, "artifacts", "music", id);
  const instrumentsRoot = join(root, "src", "instruments");
  await mkdir(instrumentsRoot, { recursive: true });
  await Promise.all([
    writeFile(join(root, ".gitignore"), "node_modules/\n.cache/\n.tmp/\n", { flag: "wx" }),
    writeJson(join(root, "package.json"), {
      name: `tonejs-music-${id}`,
      version: "0.2.0",
      private: true,
      type: "module",
    }),
    writeJson(join(root, "plan.contract.json"), {
      schema: "tonejs-music-plan/v1",
      targetStage: "source",
    }),
    writeJson(join(root, "music.project.json"), {
      schema: "tonejs-music-project/v1",
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
  title: "${id.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")}",
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

main().catch((error) => {
  process.stderr.write(`[tonejs-music-init] ${error.message}\n`);
  process.exitCode = 2;
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueMusicWriterCapability } from "../src/lib/capability.js";
import { computeMusicSubjectDigest } from "../src/lib/contract.js";
import { collectMusicModel } from "../src/lib/release.js";
import { encodePcm16Wav } from "../src/lib/wav.js";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-preview.mjs", import.meta.url));
const sha256 = (value: NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");

test("preview consumes the current render without rewriting the mix", async () => {
  const parent = await mkdtemp(join(tmpdir(), "music-preview-"));
  const root = join(parent, "artifacts", "music", "study");
  await mkdir(join(root, "src", "instruments"), { recursive: true });
  try {
    await writeFile(join(root, "music.project.json"), JSON.stringify({ schema: "music-project-delivery-guard/project/v1", artifactId: "study", sampleRate: 48000, channels: 2, tracks: [{ index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" }] }));
    await writeFile(join(root, "src", "composition.mjs"), "export default {};\n");
    await writeFile(join(root, "src", "instruments", "lead.mjs"), "export function createInstrument() {}\n");
    const initial = await collectMusicModel(root);
    const subjectDigest = computeMusicSubjectDigest(initial);
    const samples = Float32Array.from({ length: 2400 }, (_, index) => Math.sin(index / 10) * 0.05);
    const wav = encodePcm16Wav({ sampleRate: 48000, channels: [samples, samples] });
    const mixPath = `build/mix.${subjectDigest}.wav`;
    const stemPath = `proofs/t001-melody-lead.${subjectDigest}.wav`;
    const renderPath = `build/render.${subjectDigest}.json`;
    await Promise.all([mkdir(join(root, "build")), mkdir(join(root, "proofs"))]);
    await writeFile(join(root, mixPath), wav);
    await writeFile(join(root, stemPath), wav);
    await writeFile(join(root, renderPath), JSON.stringify({ schema: "tonejs-render-receipt/v1", sourceDigest: subjectDigest, sessionId: "author-session", outputs: {} }));
    const argv = [ENTRY, root, "--evidence-only"];
    await issueMusicWriterCapability({ root, capability: "music-preview", argv, subjectDigest, sessionId: "preview-session", triggerFrom: "test" });
    const before = sha256(await readFile(join(root, mixPath)));
    const result = await new Promise<{ code: number | null; stderr: string }>((resolvePromise, reject) => {
      const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolvePromise({ code, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(sha256(await readFile(join(root, mixPath))), before);
    const preview = JSON.parse(await readFile(join(root, "evidence", `preview.${subjectDigest}.json`), "utf8"));
    assert.equal(preview.mixSha256, before);
    assert.equal(preview.stems[stemPath], before);
    assert.equal(preview.attestation, "made-available-for-audition-not-proof-of-listening");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

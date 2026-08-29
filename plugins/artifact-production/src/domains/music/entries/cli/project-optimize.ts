#!/usr/bin/env node

import { open, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { loadCompositionDeterministic } from "../../lib/composition-loader.js";
import { consumeMusicWriterCapability, processMusicWriterArgv } from "../../lib/capability.js";
import { computeMusicSubjectDigest, type MusicFileMap, type MusicProjectConfig } from "../../lib/contract.js";
import { optimizeComposition } from "../../lib/music-math.js";

const root = resolve(process.argv[2] ?? "");
const journalPath = join(root, ".music-delivery-journal.json");

async function collect(directory: string, files: MusicFileMap, count: { value: number }) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp", "build", "proofs", "dist", "review"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, files, count);
    else if (entry.isFile()) {
      count.value += 1;
      if (count.value > 4096) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = (await readFile(absolute)).toString("utf8");
    }
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, filePath);
}

async function main() {
  const files: MusicFileMap = {};
  await collect(root, files, { value: 0 });
  const parsed: unknown = JSON.parse(files["music.project.json"] ?? "null");
  const project = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as MusicProjectConfig : null;
  const model = { artifactId: basename(root), files, project };
  const sourceDigest = computeMusicSubjectDigest(model);
  const grant = await consumeMusicWriterCapability({ root, capability: "music-optimize", argv: processMusicWriterArgv() });
  if (grant.subjectDigest !== sourceDigest) throw new Error("WRITER_SUBJECT_CHANGED");
  process.env.AI_EXPERTS_SESSION_ID = grant.sessionId;
  const score = optimizeComposition(await loadCompositionDeterministic(root));
  const buildRoot = join(root, "build");
  await mkdir(buildRoot, { recursive: true });
  const journal = await open(journalPath, "wx");
  await journal.writeFile(`${JSON.stringify({
    schemaVersion: 1,
    plugin: "music-production",
    operation: "optimize",
    sourceDigest,
    sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
  })}\n`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const scorePath = join(buildRoot, `score.${sourceDigest}.json`);
    const metricsPath = join(buildRoot, `metrics.${sourceDigest}.json`);
    await writeJsonAtomic(scorePath, { ...score, sourceDigest });
    await writeJsonAtomic(metricsPath, {
      schema: "tonejs-music-metrics/v1",
      engine: score.engine,
      compositionId: score.compositionId,
      sourceDigest,
      profile: score.profile,
      selectedCandidateId: score.selectedCandidateId,
      candidatesEvaluated: score.candidatesEvaluated,
      candidateSummaries: score.candidateSummaries,
      hardViolations: score.hardViolations,
      metrics: score.metrics,
    });
    complete = true;
    process.stdout.write(`${JSON.stringify({ sourceDigest, scorePath, metricsPath })}\n`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}

await main().catch((error: unknown) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-optimize] ${message}\n`);
  process.exitCode = 2;
});

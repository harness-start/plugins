#!/usr/bin/env node
// harness-source-hash: sha256:0c811d66170e751d4c95f49bfca01deb84cbe9025b35ec552ae2ab9dd9de90a7
import {
  loadCompositionDeterministic,
  optimizeComposition
} from "./chunk-6FHTPBEV.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-YL4XED56.mjs";
import {
  computeMusicSubjectDigest
} from "./chunk-T4R3BY7A.mjs";
import "./chunk-I52IKTNP.mjs";
import "./chunk-WSR4DPVF.mjs";
import "./chunk-4DTUINPK.mjs";

// plugins/artifact-production/src/domains/music/entries/cli/project-optimize.ts
import { open, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var journalPath = join(root, ".music-delivery-journal.json");
async function collect(directory, files, count) {
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
async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, { flag: "wx" });
  await rename(temporaryPath, filePath);
}
async function main() {
  const files = {};
  await collect(root, files, { value: 0 });
  const parsed = JSON.parse(files["music.project.json"] ?? "null");
  const project = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
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
    sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown"
  })}
`);
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
      metrics: score.metrics
    });
    complete = true;
    process.stdout.write(`${JSON.stringify({ sourceDigest, scorePath, metricsPath })}
`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}
await main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-optimize] ${message}
`);
  process.exitCode = 2;
});

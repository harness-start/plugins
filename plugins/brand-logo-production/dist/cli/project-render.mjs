#!/usr/bin/env node
// harness-source-hash: sha256:358ac72760ffe134d9add2fc6bdc8e9557a7601474a267dd17d2da75b95cffdd
import {
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-BH6QJOVU.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-RASMDDAN.mjs";
import {
  RENDER_EVIDENCE_SCHEMA,
  computeLogoSubjectDigest,
  validateLogoModel
} from "../chunks/chunk-2SK7HI6K.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-CTDNTXCI.mjs";

// plugins/brand-logo-production/src/entries/cli/project-render.ts
import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var stage = process.argv[3] ?? "";
var planField = (plan, key) => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan[key] : void 0;
var protectedDownstream = (path) => /^(?:evidence\.render\.json$|evidence\/preview\/|evidence\/skills\/|review\.logo\.json$|release\.manifest\.json$|receipt\.release\.json$)/u.test(path);
var renderOwned = (path) => /^(?:build\/|dist\/|evidence\/construction\/|evidence\.accessibility\.json$|src\/concepts\/.+\.[0-9a-f]{64}\.png$)/u.test(path);
var downstreamFinding = ({ path }) => /^(?:evidence\/preview\/|review\.logo\.json$|release\.manifest\.json$|receipt\.release\.json$)/u.test(path);
function runRenderer() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(npm, ["run", "--silent", "logo:render", "--", "--stage", stage], { cwd: root, env: { ...process.env, LOGO_GUARD_STAGE: stage, LOGO_GUARD_PROJECT_ROOT: root }, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`RENDER_FAILED:${signal ?? code}`)));
  });
}
async function restoreForbidden(before, after) {
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)].filter(protectedDownstream))];
  const changed = paths.filter((path) => before.digests[path] !== after.digests[path]);
  for (const path of changed) {
    const target = join(root, path);
    const original = before.bytes[path];
    if (original) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, original);
    } else await unlink(target).catch((error) => {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
    });
  }
  return changed;
}
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  if (!["source", "release"].includes(stage)) throw new Error("stage must be source or release");
  const grant = await consumeWriterCapability({ root, capability: "logo-render", argv: processWriterArgv() });
  const before = await loadLogoProject(root);
  if (grant.subjectDigest !== computeLogoSubjectDigest(before)) throw new Error("WRITER_SUBJECT_CHANGED");
  if (planField(before.plan, "targetStage") !== stage) throw new Error("RENDER_STAGE_MISMATCH: plan targetStage must match requested stage");
  await withWriterJournal(root, "logo-render", grant, async () => {
    await runRenderer();
    let model = await loadLogoProject(root);
    const forbidden = await restoreForbidden(before, model);
    if (forbidden.length) throw new Error(`RENDER_DOWNSTREAM_MUTATION:${forbidden.join(",")}`);
    model = await loadLogoProject(root);
    const outputs = Object.keys(model.files).filter(renderOwned).sort().map((path) => ({ path, sha256: model.digests[path] }));
    if (!outputs.length) throw new Error("RENDER_OUTPUTS_MISSING");
    await atomicWriteJson(root, "evidence.render.json", { schema: RENDER_EVIDENCE_SCHEMA, plugin: "brand-logo-production", artifactId: model.artifactId, subjectDigest: computeLogoSubjectDigest(model), outputs, ...sessionMetadata("logo-render", grant) });
    model = await loadLogoProject(root);
    const findings = validateLogoModel(model, { stage }).filter((item) => item.code !== "MUTATION_JOURNAL_OPEN" && !(stage === "release" && downstreamFinding(item)));
    if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  });
  process.stdout.write(`[logo-project-render] rendered ${stage} for ${basename(root)}
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-render] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

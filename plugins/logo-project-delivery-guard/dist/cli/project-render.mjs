#!/usr/bin/env node
// harness-source-hash: sha256:1ecafbd0352621e15e0b605402136b0ea866ca961edf865301c35a5fa8c3b975
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-QPTNINUP.mjs";
import {
  validateLogoModel
} from "../chunks/chunk-GKYXOIB4.mjs";

// plugins/logo-project-delivery-guard/src/entries/cli/project-render.ts
import { spawn } from "node:child_process";
import { open, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var stage = process.argv[3] ?? "";
var journalPath = join(root, ".logo-delivery-journal.json");
function runRenderer() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(npm, ["run", "--silent", "logo:render", "--", "--stage", stage], {
      cwd: root,
      env: { ...process.env, LOGO_GUARD_STAGE: stage, LOGO_GUARD_PROJECT_ROOT: root },
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.on("error", reject);
    child.on("close", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`RENDER_FAILED:${signal ?? code}`)));
  });
}
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  if (!["source", "release"].includes(stage)) throw new Error("stage must be source or release");
  const before = await loadLogoProject(root);
  if (before.plan?.targetStage !== stage) throw new Error("RENDER_STAGE_MISMATCH: plan targetStage must match requested stage");
  const handle = await open(journalPath, "wx");
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "logo-project-delivery-guard", operation: "render", artifactId: basename(root), stage, sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}
`);
  await handle.sync();
  await handle.close();
  let complete = false;
  try {
    await runRenderer();
    const model = await loadLogoProject(root);
    const findings = validateLogoModel(model, { stage }).filter(({ code, path }) => code !== "MUTATION_JOURNAL_OPEN" && !(stage === "release" && (code === "RELEASE_PATH_MISSING" && path === "receipt.release.json" || code === "RECEIPT_INVALID")));
    if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
    complete = true;
    process.stdout.write(`[logo-project-render] rendered ${stage} for ${basename(root)}
`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}
main().catch((error) => {
  process.stderr.write(`[logo-project-render] ${error.message}
`);
  process.exitCode = 2;
});

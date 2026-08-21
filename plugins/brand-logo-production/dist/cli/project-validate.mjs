#!/usr/bin/env node
// harness-source-hash: sha256:178deb3a5ad5ac1fc6dca0940d32ec39fa497256da66144b1c139bdc1c1ad69e
import {
  validateLogoModel
} from "../chunks/chunk-52QUSOYN.mjs";

// plugins/brand-logo-production/src/entries/cli/project-validate.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
async function collect(root, directory, files, digests, bytes) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests, bytes);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const raw = await readFile(absolute);
      const isBinary = /\.(png|jpg|jpeg|webp|gif|pdf)$/iu.test(filePath);
      files[filePath] = isBinary ? raw.toString("base64") : raw.toString("utf8");
      bytes[filePath] = raw;
      digests[filePath] = createHash("sha256").update(raw).digest("hex");
    }
  }
}
async function main() {
  const args = process.argv.slice(2);
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? "");
  const stageArg = args.find((a) => a.startsWith("--stage="))?.slice("--stage=".length) ?? (args.includes("--stage") ? args[args.indexOf("--stage") + 1] : null);
  const asJson = args.includes("--json");
  if (!root) {
    process.stderr.write("usage: project-validate.mjs <project-root> [--stage source|release] [--json]\n");
    process.exitCode = 2;
    return;
  }
  const files = {};
  const digests = {};
  const bytes = {};
  await collect(root, root, files, digests, bytes);
  let plan = null;
  let project = null;
  try {
    plan = JSON.parse(String(files["plan.contract.json"] ?? "null"));
  } catch {
  }
  try {
    project = JSON.parse(String(files["logo.project.json"] ?? "null"));
  } catch {
  }
  const stage = stageArg ?? (typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0) ?? "source";
  const model = { artifactId: basename(root), files, bytes, digests, plan, project };
  const findings = validateLogoModel(model, { stage });
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, stage, artifactId: model.artifactId, findings }, null, 2)}
`);
  } else if (findings.length === 0) {
    process.stdout.write(`VALID: ${stage} model passes all contract checks (${model.artifactId})
`);
  } else {
    process.stderr.write(`INVALID: ${findings.length} finding(s) at stage=${stage}
`);
    for (const f of findings) process.stderr.write(`- [${f.code}] ${f.path}: ${f.message}
`);
  }
  if (findings.length > 0) process.exitCode = 2;
}
main().catch((error) => {
  process.stderr.write(`[logo-project-validate] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

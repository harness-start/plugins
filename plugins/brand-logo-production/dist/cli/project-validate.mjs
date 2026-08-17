#!/usr/bin/env node
// harness-source-hash: sha256:c7e54f63d9dd7d296c2526c985ca5269f5bdf62308560fce83747a373d088b44
import {
  validateLogoModel
} from "../chunks/chunk-RVO6BBHP.mjs";

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

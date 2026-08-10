#!/usr/bin/env node
/**
 * Validate a logo project tree using the same contract as hooks/release.
 * Usage: node project-validate.mjs <project-root> [--stage source|release] [--json]
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { validateLogoModel } from "../lib/contract.mjs";

async function collect(root, directory, files, digests) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      // Keep binary as base64 marker for digests; text as utf8 for JSON/SVG/TSX.
      const isBinary = /\.(png|jpg|jpeg|webp|gif|pdf)$/iu.test(filePath);
      files[filePath] = isBinary ? bytes.toString("base64") : bytes.toString("utf8");
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? "");
  const stageArg = args.find((a) => a.startsWith("--stage="))?.slice("--stage=".length)
    ?? (args.includes("--stage") ? args[args.indexOf("--stage") + 1] : null);
  const asJson = args.includes("--json");
  if (!root) {
    process.stderr.write("usage: project-validate.mjs <project-root> [--stage source|release] [--json]\n");
    process.exitCode = 2;
    return;
  }
  const files = {};
  const digests = {};
  await collect(root, root, files, digests);
  let plan = null;
  let project = null;
  try { plan = JSON.parse(files["plan.contract.json"] ?? "null"); } catch { /* ignore */ }
  try { project = JSON.parse(files["logo.project.json"] ?? "null"); } catch { /* ignore */ }
  const stage = stageArg ?? plan?.targetStage ?? "source";
  const model = { artifactId: basename(root), files, digests, plan, project };
  const findings = validateLogoModel(model, { stage });
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, stage, artifactId: model.artifactId, findings }, null, 2)}\n`);
  } else if (findings.length === 0) {
    process.stdout.write(`VALID: ${stage} model passes all contract checks (${model.artifactId})\n`);
  } else {
    process.stderr.write(`INVALID: ${findings.length} finding(s) at stage=${stage}\n`);
    for (const f of findings) process.stderr.write(`- [${f.code}] ${f.path}: ${f.message}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`[logo-project-validate] ${error.message}\n`);
  process.exitCode = 2;
});

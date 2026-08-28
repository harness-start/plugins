#!/usr/bin/env node
/**
 * Validate a logo project tree using the same contract as hooks/release.
 * Usage: node project-validate.mjs <project-root> [--stage source|release] [--json]
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { validateLogoModel, type BytesMap, type DigestMap, type FileMap } from "../../lib/contract.js";

async function collect(root: string, directory: string, files: FileMap, digests: DigestMap, bytes: BytesMap): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests, bytes);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const raw = await readFile(absolute);
      // Keep binary as base64 marker for digests; text as utf8 for JSON/SVG/TSX.
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
  const stageArg = args.find((a) => a.startsWith("--stage="))?.slice("--stage=".length)
    ?? (args.includes("--stage") ? args[args.indexOf("--stage") + 1] : null);
  const asJson = args.includes("--json");
  if (!root) {
    process.stderr.write("usage: project-validate.mjs <project-root> [--stage source|release] [--json]\n");
    process.exitCode = 2;
    return;
  }
  const files: FileMap = {};
  const digests: DigestMap = {};
  const bytes: BytesMap = {};
  await collect(root, root, files, digests, bytes);
  let plan: unknown = null;
  let project: unknown = null;
  try { plan = JSON.parse(String(files["plan.contract.json"] ?? "null")); } catch { /* ignore */ }
  try { project = JSON.parse(String(files["logo.project.json"] ?? "null")); } catch { /* ignore */ }
  const stage = stageArg ?? (typeof plan === "object" && plan !== null && !Array.isArray(plan) ? (plan as Record<string, unknown>).targetStage : undefined) ?? "source";
  const model = { artifactId: basename(root), files, bytes, digests, plan, project };
  const findings = validateLogoModel(model, { stage });
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, stage, artifactId: model.artifactId, findings }, null, 2)}\n`);
  } else if (findings.length === 0) {
    process.stdout.write(`VALID: ${stage} model passes all contract checks (${model.artifactId})\n`);
  } else {
    process.stderr.write(`INVALID: ${findings.length} finding(s) at stage=${stage}\n`);
    for (const f of findings) process.stderr.write(`- [${f.code}] ${f.path}: ${f.message}\n`);
  }
  if (findings.length > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`[logo-project-validate] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

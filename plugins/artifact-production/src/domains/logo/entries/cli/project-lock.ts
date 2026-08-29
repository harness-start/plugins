#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstat, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { computeLogoSubjectDigest } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { assertLogoProjectRoot, loadLogoProject, type LoadedLogoProject } from "../../lib/project.js";
import { withWriterJournal } from "../../lib/writer.js";

const root = resolve(process.argv[2] ?? "");
const allowedMutation = (path: string) => path === "package-lock.json" || path === ".logo-delivery-journal.json";

function runNpmLock() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(npm, ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: root,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_ignore_scripts: "true",
        npm_config_package_lock_only: "true",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`LOCK_GENERATION_FAILED:${signal ?? code}`)));
  });
}

async function pathExists(path: string) {
  try { await lstat(path); return true; } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function restoreUnexpected(before: LoadedLogoProject, after: LoadedLogoProject) {
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
    .filter((path) => !allowedMutation(path));
  const changed = paths.filter((path) => before.digests[path] !== after.digests[path]);
  for (const path of changed) {
    const target = join(root, path);
    const original = before.bytes[path];
    if (original) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, original);
    } else {
      await unlink(target).catch((error: unknown) => {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
      });
    }
  }
  return changed;
}

async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  const grant = await consumeWriterCapability({ root, capability: "logo-lock", argv: processWriterArgv() });
  const before = await loadLogoProject(root);
  if (grant.subjectDigest !== computeLogoSubjectDigest(before)) throw new Error("WRITER_SUBJECT_CHANGED");
  const nodeModules = join(root, "node_modules");
  const hadNodeModules = await pathExists(nodeModules);
  await withWriterJournal(root, "logo-lock", grant, async () => {
    await runNpmLock();
    if (!hadNodeModules && await pathExists(nodeModules)) {
      await rm(nodeModules, { recursive: true, force: true });
      throw new Error("LOCK_GENERATION_NODE_MODULES_CREATED");
    }
    const model = await loadLogoProject(root);
    const changed = await restoreUnexpected(before, model);
    if (changed.length) throw new Error(`LOCK_GENERATION_OUT_OF_SCOPE:${changed.join(",")}`);
    let lock: unknown;
    try { lock = JSON.parse(String(model.files["package-lock.json"] ?? "")); } catch { throw new Error("PACKAGE_LOCK_INVALID"); }
    if (typeof lock !== "object" || lock === null || Array.isArray(lock)) throw new Error("PACKAGE_LOCK_INVALID");
    const value = lock as Record<string, unknown>;
    if (!Number.isInteger(value.lockfileVersion) || typeof value.packages !== "object" || value.packages === null || Array.isArray(value.packages)) throw new Error("PACKAGE_LOCK_INVALID");
  });
  process.stdout.write(`[logo-project-lock] generated package-lock for ${basename(root)}\n`);
}

await main().catch((error: unknown) => {
  process.stderr.write(`[logo-project-lock] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

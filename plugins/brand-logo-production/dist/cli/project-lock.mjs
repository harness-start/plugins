#!/usr/bin/env node
// harness-source-hash: sha256:c633e514c8b6e22889b72b5d0d4eb8e6d1c8e9b4d53f21168e1cfdc3f8bbf728
import {
  withWriterJournal
} from "../chunks/chunk-ZQS6YS2R.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-GG5KTI7T.mjs";
import {
  computeLogoSubjectDigest
} from "../chunks/chunk-S2AMY7MO.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-CZ3JICN3.mjs";

// plugins/brand-logo-production/src/entries/cli/project-lock.ts
import { spawn } from "node:child_process";
import { lstat, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var allowedMutation = (path) => path === "package-lock.json" || path === ".logo-delivery-journal.json";
function runNpmLock() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(npm, ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: root,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_ignore_scripts: "true",
        npm_config_package_lock_only: "true"
      },
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.on("error", reject);
    child.on("close", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`LOCK_GENERATION_FAILED:${signal ?? code}`)));
  });
}
async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
async function restoreUnexpected(before, after) {
  const paths = [.../* @__PURE__ */ new Set([...Object.keys(before.files), ...Object.keys(after.files)])].filter((path) => !allowedMutation(path));
  const changed = paths.filter((path) => before.digests[path] !== after.digests[path]);
  for (const path of changed) {
    const target = join(root, path);
    const original = before.bytes[path];
    if (original) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, original);
    } else {
      await unlink(target).catch((error) => {
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
    let lock;
    try {
      lock = JSON.parse(String(model.files["package-lock.json"] ?? ""));
    } catch {
      throw new Error("PACKAGE_LOCK_INVALID");
    }
    if (typeof lock !== "object" || lock === null || Array.isArray(lock)) throw new Error("PACKAGE_LOCK_INVALID");
    const value = lock;
    if (!Number.isInteger(value.lockfileVersion) || typeof value.packages !== "object" || value.packages === null || Array.isArray(value.packages)) throw new Error("PACKAGE_LOCK_INVALID");
  });
  process.stdout.write(`[logo-project-lock] generated package-lock for ${basename(root)}
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-lock] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXPECTED_DIGEST =
  "42b1941a700e2bb82142c55063b2e3f780a75fd95308f94d5da5f7799db61582";
const EXCLUDED = new Set([
  "laravel-runtime-guards:php-laravel-env-detector",
  "webman-runtime-guards:php-webman-env-detector",
]);
const FORBIDDEN_DIRS = new Set(["vendor", "node_modules", "dist", "build", "generated"]);
const FORBIDDEN_LOCKS = new Set([
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

function fail(message) {
  throw new Error(message);
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory() && FORBIDDEN_DIRS.has(entry.name)) {
      fail(`forbidden migrated artifact directory: ${relative(ROOT, path)}`);
    }
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function validateMigrationParity(root = ROOT) {
  const parity = json(join(root, "docs", "migration-parity.json"));
  if (parity.schema !== 1 || parity.sourceHookCount !== 202) {
    fail("migration parity schema/count mismatch");
  }
  if (
    parity.policy?.runtime !== "direct-node-mjs" ||
    parity.policy?.noInstallCompileBundle !== true
  ) {
    fail("migration runtime policy drifted");
  }
  const excludedArtifacts = new Set(parity.policy?.excludedArtifacts ?? []);
  if (
    excludedArtifacts.size !== FORBIDDEN_DIRS.size ||
    [...excludedArtifacts].some((name) => !FORBIDDEN_DIRS.has(name))
  ) {
    fail("migration artifact policy drifted");
  }
  const pairs = [];
  for (const [plugin, record] of Object.entries(parity.plugins ?? {})) {
    const pluginRoot = join(root, "plugins", plugin);
    if (!existsSync(pluginRoot)) fail(`parity target plugin missing: ${plugin}`);
    if (!["target-native", "excluded-by-plan"].includes(record.disposition)) {
      fail(`invalid disposition: ${plugin}`);
    }
    if (record.disposition === "excluded-by-plan" && !record.reason) {
      fail(`excluded hook lacks reason: ${plugin}`);
    }
    for (const id of record.hookIds ?? []) pairs.push(`${plugin}:${id}`);
    for (const platform of [".claude-plugin", ".codex-plugin"]) {
      const manifestPath = join(pluginRoot, platform, "plugin.json");
      if (!existsSync(manifestPath)) {
        fail(`manifest missing: ${relative(root, manifestPath)}`);
      }
      const manifest = json(manifestPath);
      const hooksPath = join(pluginRoot, manifest.hooks);
      if (!existsSync(hooksPath)) {
        fail(`hook config missing: ${relative(root, hooksPath)}`);
      }
      const hooksText = readFileSync(hooksPath, "utf8");
      for (const match of hooksText.matchAll(/\/scripts\/([^"\s]+\.mjs)/gu)) {
        if (!existsSync(join(pluginRoot, "scripts", match[1]))) {
          fail(`hook entry missing: ${plugin}/scripts/${match[1]}`);
        }
      }
    }
    if (
      !existsSync(join(pluginRoot, "tests")) ||
      !existsSync(join(pluginRoot, "acceptance", "cases"))
    ) {
      fail(`verification suite missing: ${plugin}`);
    }
  }
  const uniquePairs = new Set(pairs);
  if (uniquePairs.size !== pairs.length || pairs.length !== parity.sourceHookCount) {
    fail(`source hook coverage mismatch: total=${pairs.length}, unique=${uniquePairs.size}`);
  }
  const digest = createHash("sha256").update([...pairs].sort().join("\n")).digest("hex");
  if (digest !== EXPECTED_DIGEST || parity.sourceHookIdDigest !== EXPECTED_DIGEST) {
    fail(`source hook identity digest mismatch: ${digest}`);
  }
  const excluded = new Set(
    Object.entries(parity.plugins).flatMap(([plugin, record]) =>
      record.disposition === "excluded-by-plan"
        ? record.hookIds.map((id) => `${plugin}:${id}`)
        : [],
    ),
  );
  if (excluded.size !== EXCLUDED.size || [...excluded].some((item) => !EXCLUDED.has(item))) {
    fail(`unexpected excluded hooks: ${[...excluded].join(", ")}`);
  }
  for (const path of walk(join(root, "plugins"))) {
    const name = path.split(/[\\/]/u).at(-1);
    if (FORBIDDEN_LOCKS.has(name)) {
      fail(`forbidden package-manager artifact: ${relative(root, path)}`);
    }
    if (/\.(?:ts|tsx|map)$/u.test(name)) {
      fail(`source/build artifact not allowed: ${relative(root, path)}`);
    }
    if (name.endsWith(".mjs") && readFileSync(path, "utf8").includes("@harness/")) {
      fail(`source-only import not allowed: ${relative(root, path)}`);
    }
  }
  return {
    hooks: pairs.length,
    plugins: Object.keys(parity.plugins).length,
    migrated: pairs.length - excluded.size,
    excluded: excluded.size,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...validateMigrationParity() })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

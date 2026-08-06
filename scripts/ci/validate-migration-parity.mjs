#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXPECTED_DIGEST =
  "42b1941a700e2bb82142c55063b2e3f780a75fd95308f94d5da5f7799db61582";
const EXCLUDED = new Set([
  "context-rules:context-injector",
  "context-rules:context-rule-injector",
  "context-rules:design-doc-detector",
  "context-rules:feedback-reflection-reminder",
  "context-rules:harness-overview-injector",
  "context-rules:memory-staleness-auditor",
  "context-rules:prompt-guidance-capsule",
  "context-rules:session-runtime-feedback-reminder",
  "context-rules:skill-routing-reminder",
  "context-rules:skill-trigger-telemetry-advisor-reminder",
  "context-rules:skill-usage-audit",
  "context-rules:subagent-principles-injector",
  "context-rules:telemetry-upload-session-start",
  "context-rules:telemetry-upload-stop",
  "delivery-evidence:api-breaking-change-guard",
  "delivery-evidence:delivery-closure-gate",
  "delivery-evidence:design-accessibility-completion-gate",
  "delivery-evidence:design-contract-drift-guard",
  "delivery-evidence:docs-consistency-guard",
  "delivery-evidence:documents-encoding-guard",
  "delivery-evidence:external-effect-closure-gate",
  "delivery-evidence:gitlab-review-completion-gate",
  "delivery-evidence:migration-parity-completion-gate",
  "delivery-evidence:next-step-solvability-gate",
  "delivery-evidence:pptx-completion-gate",
  "delivery-evidence:skill-next-step-gate",
  "delivery-evidence:spec-plan-artifact-gate",
  "delivery-evidence:task-ledger-completion-gate",
  "delivery-evidence:tdd-sequence-completion-gate",
  "delivery-evidence:tdd-sequence-tracker",
  "delivery-evidence:verification-provenance-gate",
  "delivery-evidence:video-production-evidence-gate",
  "execution-discipline-guards:backup-artifact-guard",
  "execution-discipline-guards:debt-marker-guard",
  "execution-discipline-guards:edit-loop-detector",
  "execution-discipline-guards:error-retry-guard",
  "execution-discipline-guards:error-retry-guard-post-success",
  "execution-discipline-guards:external-skill-global-install-guard",
  "execution-discipline-guards:external-skill-isolation-guard",
  "execution-discipline-guards:garbled-text-guard",
  "execution-discipline-guards:language-drift-bash-feedback",
  "execution-discipline-guards:language-drift-stop-gate",
  "execution-discipline-guards:language-drift-tool-feedback",
  "execution-discipline-guards:language-intent-marker",
  "execution-discipline-guards:markdown-budget-guard",
  "execution-discipline-guards:plan-debt-guard",
  "execution-discipline-guards:reasoning-depth-gate",
  "execution-discipline-guards:remote-polling-budget-guard",
  "execution-discipline-guards:syntax-json",
  "execution-discipline-guards:syntax-xml",
  "execution-discipline-guards:task-ledger-mutation-guard",
  "execution-discipline-guards:task-ledger-resume-injector",
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
    if (!["target-native", "excluded-by-plan"].includes(record.disposition)) {
      fail(`invalid disposition: ${plugin}`);
    }
    if (record.disposition === "excluded-by-plan" && !record.reason) {
      fail(`excluded hook lacks reason: ${plugin}`);
    }
    for (const id of record.hookIds ?? []) pairs.push(`${plugin}:${id}`);
    // Fully excluded plugins may be removed from the tree; only on-disk plugins need structure checks.
    if (record.disposition === "excluded-by-plan" && !existsSync(pluginRoot)) {
      continue;
    }
    if (!existsSync(pluginRoot)) fail(`parity target plugin missing: ${plugin}`);
    for (const [platform, expectedHooks] of [
      [".claude-plugin", "./hooks/claude.json"],
      [".codex-plugin", "./hooks/codex.json"],
    ]) {
      const manifestPath = join(pluginRoot, platform, "plugin.json");
      if (!existsSync(manifestPath)) {
        fail(`manifest missing: ${relative(root, manifestPath)}`);
      }
      const manifest = json(manifestPath);
      if (manifest.hooks !== expectedHooks) {
        fail(
          `platform hook config mismatch: ${plugin}/${platform} uses ${manifest.hooks ?? "<missing>"}, expected ${expectedHooks}`,
        );
      }
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
    if (relative(root, path).replaceAll("\\", "/").endsWith("/hooks/hooks.json")) {
      fail(`ambiguous cross-platform hook config is not allowed: ${relative(root, path)}`);
    }
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

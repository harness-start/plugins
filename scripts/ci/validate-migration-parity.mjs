#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXPECTED_DIGEST =
  "1fffb0313485ccda8a0065206626997fb33b1dd4c21eaf7e1e6dcb29aadb5e0f";
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
  "git-delivery-guards:devops-lint-gitlab-ci-duplicate-pipeline",
  "git-delivery-guards:git-add-guard",
  "git-delivery-guards:git-branch-naming-guard",
  "git-delivery-guards:git-bulk-conflict-choice-guard",
  "git-delivery-guards:git-commit-heredoc-guard",
  "git-delivery-guards:git-commit-message-guard",
  "git-delivery-guards:git-commit-scope-guard",
  "git-delivery-guards:git-destructive-command-guard",
  "git-delivery-guards:git-partial-staging-guard",
  "git-delivery-guards:git-stale-lock-guard",
  "git-delivery-guards:github-actions-state-change-audit",
  "git-delivery-guards:gitlab-review-mutation-guard",
  "git-delivery-guards:merge-conflict-guard",
  "git-delivery-guards:svn-bulk-operation-guard",
  "git-delivery-guards:svn-commit-message-guard",
  "infra-devops-guards:devops-dangerous-infra-guard",
  "infra-devops-guards:devops-lint-actionlint",
  "infra-devops-guards:devops-lint-kubeconform",
  "infra-devops-guards:devops-lint-terraform-fmt",
  "infra-devops-guards:devops-linux-lint-shellcheck",
  "infra-devops-guards:devops-linux-syntax-bash",
  "infra-devops-guards:devops-linux-syntax-zsh",
  "infra-devops-guards:devops-production-kubectl-guard",
  "infra-devops-guards:devops-syntax-dockerfile",
  "infra-devops-guards:devops-syntax-yaml",
  "infra-devops-guards:iac-debt-guard",
  "infra-devops-guards:infrastructure-dependency-lockfile-guard",
  "infra-devops-guards:infrastructure-encoding-guard",
  "infra-devops-guards:k8s-stateful-storage-guard",
  "infra-devops-guards:network-probe-intensity-guard",
  "infra-devops-guards:pve-destructive-operation-guard",
  "misc-lang-guards:angular-env-detector",
  "misc-lang-guards:cpp-debug-statement-guard",
  "misc-lang-guards:cpp-encoding-guard",
  "misc-lang-guards:cpp-env-detector",
  "misc-lang-guards:dotnet-dependency-lockfile-guard",
  "misc-lang-guards:dotnet-encoding-guard",
  "misc-lang-guards:elixir-dependency-lockfile-guard",
  "misc-lang-guards:elixir-env-detector",
  "misc-lang-guards:elixir-syntax",
  "misc-lang-guards:nix-dependency-lockfile-guard",
  "misc-lang-guards:remotion-env-detector",
  "misc-lang-guards:rlang-dependency-lockfile-guard",
  "misc-lang-guards:rlang-encoding-guard",
  "misc-lang-guards:ruby-dependency-lockfile-guard",
  "misc-lang-guards:ruby-encoding-guard",
  "misc-lang-guards:solidity-env-detector",
  "misc-lang-guards:solidity-syntax",
  "misc-lang-guards:syntax-cpp",
  "misc-lang-guards:windows-env-detector",
  "misc-lang-guards:windows-script-codepage-guard",
  "mobile-guards:android-env-detector",
  "mobile-guards:dart-dependency-lockfile-guard",
  "mobile-guards:dart-syntax",
  "mobile-guards:flutter-env-detector",
  "mobile-guards:ios-dependency-lockfile-guard",
  "mobile-guards:ios-encoding-guard",
  "mobile-guards:ios-env-detector",
  "mobile-guards:ios-lint-swift-concurrency",
  "mobile-guards:objc-uikit-pattern-guard",
  "web-frontend-guards:frontend-creative-env-detector",
  "web-frontend-guards:frontend-encoding-guard",
  "web-frontend-guards:frontend-env-detector",
  "web-frontend-guards:frontend-syntax-taro-dom",
  "web-frontend-guards:frontend-syntax-wxml",
  "web-frontend-guards:frontend-syntax-wxss",
  "web-frontend-guards:frontend-validation-debt-guard",
  "web-frontend-guards:javascript-vue-env-detector",
  "web-frontend-guards:react-env-detector",
  "web-frontend-guards:react-nextjs-env-detector",
  "web-frontend-guards:stylelint-coverage-primer",
  "web-frontend-guards:svelte-env-detector",
  "web-frontend-guards:svelte-syntax",
  "web-frontend-guards:vue-syntax",
  "web-frontend-guards:wechat-miniprogram-config-guard",
  "go-runtime-guards:go-debt-guard",
  "go-runtime-guards:go-dependency-lockfile-guard",
  "go-runtime-guards:go-encoding-guard",
  "go-runtime-guards:go-env-detector",
  "go-runtime-guards:go-lint-coverage-primer",
  "go-runtime-guards:go-syntax",
  "go-runtime-guards:go-tool-output-primer",
  "jvm-runtime-guards:java-env-detector",
  "jvm-runtime-guards:java-syntax",
  "jvm-runtime-guards:jvm-debt-guard",
  "jvm-runtime-guards:jvm-dependency-lockfile-guard",
  "jvm-runtime-guards:jvm-encoding-guard",
  "jvm-runtime-guards:kotlin-env-detector",
  "jvm-runtime-guards:kotlin-syntax",
  "laravel-runtime-guards:php-laravel-env-detector",
  "php-runtime-guards:composer-repositories-guard",
  "php-runtime-guards:composer-unicode-escape-guard",
  "php-runtime-guards:php-debt-guard",
  "php-runtime-guards:php-debug-statement-guard",
  "php-runtime-guards:php-dependency-lockfile-guard",
  "php-runtime-guards:php-encoding-guard",
  "php-runtime-guards:php-env-detector",
  "php-runtime-guards:php-heavy-command-repeat-guard",
  "php-runtime-guards:php-heavy-command-repeat-guard-post-success",
  "php-runtime-guards:php-lint-phpstan",
  "php-runtime-guards:php-lint-phpstan-stop",
  "php-runtime-guards:php-protected-paths",
  "php-runtime-guards:php-syntax",
  "php-runtime-guards:php-syntax-composer",
  "php-runtime-guards:php-test-output-truncation-guard",
  "python-runtime-guards:python-debt-guard",
  "python-runtime-guards:python-dependency-lockfile-guard",
  "python-runtime-guards:python-encoding-guard",
  "python-runtime-guards:python-env-detector",
  "python-runtime-guards:python-lint-coverage-primer",
  "python-runtime-guards:python-lint-ruff",
  "python-runtime-guards:python-syntax",
  "rust-runtime-guards:rust-debt-guard",
  "rust-runtime-guards:rust-debug-statement-guard",
  "rust-runtime-guards:rust-dependency-lockfile-guard",
  "rust-runtime-guards:rust-encoding-guard",
  "rust-runtime-guards:rust-env-detector",
  "rust-runtime-guards:tauri-env-detector",
  "symfony-runtime-guards:php-symfony-protected-paths",
  "symfony-runtime-guards:php-symfony-syntax-doctrine-entity",
  "symfony-runtime-guards:php-symfony-syntax-twig",
  "typescript-runtime-guards:any-type-guard",
  "typescript-runtime-guards:deno-env-detector",
  "typescript-runtime-guards:deno-syntax",
  "typescript-runtime-guards:javascript-env-detector",
  "typescript-runtime-guards:javascript-syntax",
  "typescript-runtime-guards:suppression-guard",
  "typescript-runtime-guards:typescript-debt-guard",
  "typescript-runtime-guards:typescript-dependency-lockfile-guard",
  "typescript-runtime-guards:typescript-encoding-guard",
  "typescript-runtime-guards:typescript-env-detector",
  "typescript-runtime-guards:typescript-lint-eslint",
  "typescript-runtime-guards:typescript-nestjs-env-detector",
  "typescript-runtime-guards:typescript-syntax",
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
      const formattedHooksText = `${JSON.stringify(JSON.parse(hooksText), null, 2)}\n`;
      if (hooksText !== formattedHooksText) {
        fail(
          `hook config must use two-space multi-line JSON formatting: ${relative(root, hooksPath)}`,
        );
      }
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

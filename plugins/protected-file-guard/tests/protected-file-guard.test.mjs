import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILTIN_RULES,
  matchRule,
  resolveRules,
} from "../scripts/lib/protected-file-policy.mjs";
import {
  extractFileTargets,
  extractPatchTargets,
  matchPathsForTarget,
} from "../scripts/protected-file-guard.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/protected-file-guard.mjs", import.meta.url),
);

function builtIn(path) {
  return matchRule([path], BUILTIN_RULES);
}

test("built-ins protect all migrated dependency lockfiles", () => {
  const names = [
    "bun.lock",
    "bun.lockb",
    "deno.lock",
    "npm-shrinkwrap.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "pdm.lock",
    "Pipfile.lock",
    "poetry.lock",
    "uv.lock",
    "composer.lock",
    "Gemfile.lock",
    "Cargo.lock",
    "go.sum",
    "gradle.lockfile",
    "packages.lock.json",
    "mix.lock",
    "flake.lock",
    "renv.lock",
    "pubspec.lock",
    "Package.resolved",
    "Podfile.lock",
    ".terraform.lock.hcl",
  ];
  for (const name of names) {
    assert.equal(builtIn(`workspace/app/${name}`)?.mode, "block", name);
  }
  assert.equal(
    builtIn("gradle/dependency-locks/runtimeClasspath.lockfile")?.mode,
    "block",
  );
});

test("built-ins protect dependency directories without substring false positives", () => {
  for (const path of [
    "node_modules/pkg/index.js",
    "vendor/acme/pkg.php",
    ".venv/lib/python/site.py",
    "ios/Pods/Library/file.m",
    ".terraform/providers/provider.bin",
    ".build/checkouts/package/Sources/App.swift",
    ".nuget/packages/example/1.0/lib.dll",
  ]) {
    assert.equal(builtIn(path)?.mode, "block", path);
  }
  for (const path of [
    "src/vendorized/client.ts",
    "src/node_modules_backup/index.js",
    "packages/app/src/index.ts",
    "target/release/app",
    "dist/app.js",
  ]) {
    assert.equal(builtIn(path), null, path);
  }
});

test("user rules are prepended and first match wins", () => {
  const allow = {
    id: "allow-patched-vendor",
    match: /^vendor\/acme\/patched\//u,
    mode: "allow",
  };
  const block = {
    id: "protect-generated-sdk",
    match: /^src\/generated-sdk\//u,
    reason: "generated",
  };
  const rules = resolveRules({ rules: [allow, block] });
  assert.equal(rules[0].id, allow.id);
  assert.equal(matchRule(["vendor/acme/patched/fix.php"], rules)?.mode, "allow");
  assert.equal(matchRule(["vendor/acme/upstream/file.php"], rules)?.mode, "block");
  assert.equal(matchRule(["src/generated-sdk/client.ts"], rules)?.id, block.id);
});

test("invalid config rules warn and preserve built-ins", () => {
  const warnings = [];
  const rules = resolveRules(
    { rules: [{ match: "vendor", mode: "allow" }, { match: /src/u, mode: "skip" }] },
    (message) => warnings.push(message),
  );
  assert.equal(warnings.length, 2);
  assert.equal(matchRule(["vendor/acme/file.php"], rules)?.mode, "block");

  const fallback = resolveRules(
    { rules: {} },
    (message) => warnings.push(message),
  );
  assert.equal(matchRule(["package-lock.json"], fallback)?.mode, "block");
});

test("global and sticky RegExp rules remain reusable", () => {
  const rules = resolveRules({
    rules: [{ id: "global", match: /^private\//gu, mode: "block" }],
  });
  assert.equal(matchRule(["private/a.txt"], rules)?.id, "global");
  assert.equal(matchRule(["private/b.txt"], rules)?.id, "global");
});

test("patch extraction includes add, update, delete, and move destinations", () => {
  const payload = [
    "*** Begin Patch",
    "*** Add File: vendor/acme/new.php",
    "*** Update File: src/current.ts",
    "*** Move to: node_modules/pkg/current.ts",
    "*** Delete File: Cargo.lock",
    "*** End Patch",
  ].join("\n");
  assert.deepEqual(extractPatchTargets(payload), [
    "vendor/acme/new.php",
    "src/current.ts",
    "node_modules/pkg/current.ts",
    "Cargo.lock",
  ]);
});

test("file target extraction supports direct, nested edit, notebook, and patch inputs", () => {
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "MultiEdit",
      tool_input: {
        file_path: "src/main.ts",
        edits: [{ path: "vendor/acme/file.php" }],
      },
    }),
    ["/repo/src/main.ts", "/repo/vendor/acme/file.php"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "notebooks/demo.ipynb" },
    }),
    ["/repo/notebooks/demo.ipynb"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "apply_patch",
      tool_input: { patch: "*** Update File: pnpm-lock.yaml" },
    }),
    ["/repo/pnpm-lock.yaml"],
  );
  assert.deepEqual(
    extractFileTargets({
      workingDirectory: "/repo",
      tool: {
        name: "Write",
        input: { filePath: "node_modules/pkg/index.js" },
      },
    }),
    ["/repo/node_modules/pkg/index.js"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "printf x > vendor/acme/file.php" },
    }),
    ["/repo/vendor/acme/file.php"],
  );
  assert.deepEqual(
    extractFileTargets({
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: {
        command: "python3 -c \"open('package-lock.json','w').write('{}')\"",
      },
    }),
    ["/repo/package-lock.json"],
  );
});

test("resolved paths expose protected symlink destinations", () => {
  const root = mkdtempSync(join(tmpdir(), "protected-file-symlink-"));
  try {
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    symlinkSync(join(root, "node_modules", "pkg"), join(root, "src", "linked"));
    const paths = matchPathsForTarget(
      join(root, "src", "linked", "new.js"),
      root,
      root,
    );
    assert.ok(paths.includes("src/linked/new.js"));
    assert.ok(paths.includes("node_modules/pkg/new.js"));
    assert.equal(matchRule(paths, BUILTIN_RULES)?.mode, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runEntry(input, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("entry denies protected writes with a complete blocking contract", async () => {
  const result = await runEntry(
    JSON.stringify({
      cwd: "/repo",
      tool_name: "Write",
      tool_input: { file_path: "vendor/acme/file.php", content: "tampered" },
    }),
  );
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  const reason = output.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /\[Protected File Guard\]/u);
  for (const field of [
    "blockingContract",
    "observedFacts",
    "harm",
    "unblockWhen",
    "recovery",
  ]) {
    assert.match(reason, new RegExp(field));
  }
});

test("entry allows safe paths and ignores malformed JSON", async () => {
  const safe = await runEntry(
    JSON.stringify({
      cwd: "/repo",
      tool_name: "Edit",
      tool_input: { file_path: "src/app.ts", new_string: "ok" },
    }),
  );
  assert.deepEqual(
    { code: safe.code, stdout: safe.stdout, stderr: safe.stderr },
    { code: 0, stdout: "", stderr: "" },
  );
  const malformed = await runEntry("{");
  assert.deepEqual(
    { code: malformed.code, stdout: malformed.stdout, stderr: malformed.stderr },
    { code: 0, stdout: "", stderr: "" },
  );
});

test("project config can narrowly allow a built-in protected path", async () => {
  const root = mkdtempSync(join(tmpdir(), "protected-file-config-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(
      join(root, ".protected-file-guard.mjs"),
      [
        "export default {",
        "  rules: [",
        "    { match: /^vendor\\/acme\\/patched\\//, mode: \"allow\" },",
        "  ],",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    const allowed = await runEntry(
      JSON.stringify({
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: "vendor/acme/patched/fix.php" },
      }),
      root,
    );
    assert.equal(allowed.stdout, "");

    const denied = await runEntry(
      JSON.stringify({
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: "vendor/acme/upstream/file.php" },
      }),
      root,
    );
    assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry denies shell and interpreter writes of lockfiles", async () => {
  const root = mkdtempSync(join(tmpdir(), "protected-file-shell-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const redirect = await runEntry(
      JSON.stringify({
        cwd: root,
        tool_name: "Bash",
        tool_input: { command: "printf x > package-lock.json" },
      }),
      root,
    );
    assert.equal(
      JSON.parse(redirect.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
    const interpreter = await runEntry(
      JSON.stringify({
        cwd: root,
        tool_name: "Bash",
        tool_input: {
          command: "python3 -c \"open('yarn.lock','w').write('x')\"",
        },
      }),
      root,
    );
    assert.equal(
      JSON.parse(interpreter.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("broken project config warns and keeps built-in protection", async () => {
  const root = mkdtempSync(join(tmpdir(), "protected-file-broken-config-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(
      join(root, ".protected-file-guard.mjs"),
      "export default { rules: [;\n",
      "utf8",
    );
    const result = await runEntry(
      JSON.stringify({
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: "package-lock.json" },
      }),
      root,
    );
    assert.equal(result.code, 0);
    assert.match(result.stderr, /failed to load \.protected-file-guard\.mjs/u);
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

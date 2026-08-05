/**
 * PreToolUse checks: composer policy guards, protected paths, truncation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  collectRepositoriesHits,
  repositoriesDenyMessage,
} from "../scripts/checks/composer-repositories.mjs";
import {
  collectUnicodeEscapeHits,
  unicodeEscapeDenyMessage,
} from "../scripts/checks/composer-unicode-escape.mjs";
import {
  collectLockfileTargets,
  lockfileDenyMessage,
  shellDependencyLockfileWriteTargets,
} from "../scripts/checks/composer-lockfile.mjs";
import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "../scripts/checks/protected-paths.mjs";
import { truncationHit, truncationReportMessage } from "../scripts/checks/test-truncation.mjs";

const PRE_TOOL = fileURLToPath(new URL("../scripts/php-hook-pre-tool.mjs", import.meta.url));

// ── composer-repositories ──────────────────────────────────────────────

test("repositories: Write with repositories key is denied", () => {
  const hits = collectRepositoriesHits({
    toolName: "Write",
    input: {
      file_path: "/repo/composer.json",
      content: '{\n  "repositories": {"foo": {"type": "vcs"}}\n}\n',
    },
  });
  assert.deepEqual(hits, ["tool_input.content"]);
});

test("repositories: Edit new_string hit", () => {
  const hits = collectRepositoriesHits({
    toolName: "Edit",
    input: { file_path: "composer.json", new_string: '  "repositories": {},' },
  });
  assert.deepEqual(hits, ["tool_input.new_string"]);
});

test("repositories: MultiEdit new_string hits are indexed", () => {
  const hits = collectRepositoriesHits({
    toolName: "MultiEdit",
    input: {
      file_path: "composer.json",
      edits: [
        { old_string: "a", new_string: "b" },
        { old_string: "c", new_string: '  "repositories": {"r": {}}' },
      ],
    },
  });
  assert.deepEqual(hits, ["tool_input.edits[1].new_string"]);
});

test("repositories: apply_patch added lines are attributed to composer.json", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: src/App.php",
    "@@",
    "+    $x = 1;",
    "*** Update File: composer.json",
    "@@",
    '+    "repositories": {"local": {"type": "path", "url": "../x"}},',
  ].join("\n");
  const hits = collectRepositoriesHits({
    toolName: "ApplyPatch",
    input: { patch },
  });
  assert.deepEqual(hits, ["patch:composer.json"]);
});

test("repositories: apply_patch lines for other files are ignored", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: src/App.php",
    "@@",
    '+    "repositories": {"evil": {}},',
  ].join("\n");
  const hits = collectRepositoriesHits({ toolName: "ApplyPatch", input: { patch } });
  assert.deepEqual(hits, []);
});

test("repositories: Bash composer config repositories denied, --unset/--global allowed", () => {
  assert.deepEqual(
    collectRepositoriesHits({
      toolName: "Bash",
      input: { command: "composer config repositories.foo vcs https://x.example" },
    }),
    ["composer config repositories"],
  );
  assert.deepEqual(
    collectRepositoriesHits({
      toolName: "Bash",
      input: { command: "composer config --unset repositories.foo" },
    }),
    [],
  );
  assert.deepEqual(
    collectRepositoriesHits({
      toolName: "Bash",
      input: { command: "composer config --global repositories.foo vcs https://x.example" },
    }),
    [],
  );
});

test("repositories: Bash redirect writing repositories into composer.json denied", () => {
  const hits = collectRepositoriesHits({
    toolName: "Bash",
    input: {
      command:
        'echo \'{"repositories": {}}\' > composer.json',
    },
  });
  assert.ok(hits.length > 0);
});

test("repositories: non-composer.json writes are ignored", () => {
  const hits = collectRepositoriesHits({
    toolName: "Write",
    input: { file_path: "/repo/package.json", content: '{"repositories": {}}' },
  });
  assert.deepEqual(hits, []);
});

test("repositories: deny message contains blockingContract", () => {
  const message = repositoriesDenyMessage("Write", ["tool_input.content"]);
  assert.match(message, /Composer Repositories Guard/);
  assert.match(message, /blockingContract/);
  assert.match(message, /unblockWhen/);
  assert.match(message, /recovery/);
});

// ── composer-unicode-escape ────────────────────────────────────────────

test("unicode escape: BMP Chinese escape is denied", () => {
  const hits = collectUnicodeEscapeHits({
    toolName: "Edit",
    input: {
      file_path: "composer.json",
      new_string: '  "description": "\\u4e2d\\u6587\\u63cf\\u8ff0",',
    },
  });
  assert.equal(hits.length, 4);
  assert.equal(hits[0].char, "中");
});

test("unicode escape: surrogate pair (emoji-adjacent CJK ext B) decoded", () => {
  // U+20000 (CJK Ext B) as surrogate pair
  const hits = collectUnicodeEscapeHits({
    toolName: "Write",
    input: {
      file_path: "composer.json",
      content: '{"description": "\\ud840\\udc00"}',
    },
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].char, "\u{20000}");
  assert.equal(hits[0].escape, "\\ud840\\udc00");
});

test("unicode escape: non-CJK escapes are ignored", () => {
  const hits = collectUnicodeEscapeHits({
    toolName: "Edit",
    input: { file_path: "composer.json", new_string: '"name": "\\u0061\\u0062"' },
  });
  assert.deepEqual(hits, []);
});

test("unicode escape: escaped backslash before \\u is not a real escape", () => {
  const hits = collectUnicodeEscapeHits({
    toolName: "Edit",
    input: { file_path: "composer.json", new_string: '"desc": "\\\\u4e2d"' },
  });
  assert.deepEqual(hits, []);
});

test("unicode escape: literal Chinese is clean", () => {
  const hits = collectUnicodeEscapeHits({
    toolName: "Edit",
    input: { file_path: "composer.json", new_string: '"desc": "中文描述"' },
  });
  assert.deepEqual(hits, []);
});

test("unicode escape: deny message lists escape -> char mapping", () => {
  const hits = [
    { source: "tool_input.new_string", escape: "\\u4e2d", char: "中" },
  ];
  const message = unicodeEscapeDenyMessage("Edit", hits);
  assert.match(message, /Unicode Escape Guard/);
  assert.match(message, /\\u4e2d -> 中/);
  assert.match(message, /blockingContract/);
});

// ── composer-lockfile ──────────────────────────────────────────────────

test("lockfile: direct Write of composer.lock is denied", () => {
  const targets = collectLockfileTargets({
    toolName: "Write",
    input: { file_path: "/repo/composer.lock" },
  });
  assert.deepEqual(targets, ["/repo/composer.lock"]);
});

test("lockfile: writing composer.json is allowed", () => {
  const targets = collectLockfileTargets({
    toolName: "Edit",
    input: { file_path: "/repo/composer.json" },
  });
  assert.deepEqual(targets, []);
});

test("lockfile: shell redirect to composer.lock is denied", () => {
  const targets = collectLockfileTargets({
    toolName: "Bash",
    input: { command: "echo '{}' > composer.lock" },
  });
  assert.deepEqual(targets, ["composer.lock"]);
});

test("lockfile: tee and sed -i writes are denied", () => {
  assert.deepEqual(
    collectLockfileTargets({
      toolName: "Bash",
      input: { command: "echo 'x' | tee composer.lock" },
    }),
    ["composer.lock"],
  );
  assert.deepEqual(
    collectLockfileTargets({
      toolName: "Bash",
      input: { command: "sed -i 's/a/b/' composer.lock" },
    }),
    ["composer.lock"],
  );
});

test("lockfile: composer update is allowed (regenerator)", () => {
  const targets = collectLockfileTargets({
    toolName: "Bash",
    input: { command: "composer update --lock" },
  });
  assert.deepEqual(targets, []);
});

test("lockfile: shellDependencyLockfileWriteTargets handles wrappers and env", () => {
  assert.deepEqual(
    shellDependencyLockfileWriteTargets("env FOO=1 composer exec -- x > composer.lock"),
    ["composer.lock"],
  );
});

test("lockfile: deny message contains blockingContract", () => {
  const message = lockfileDenyMessage(["/repo/composer.lock"]);
  assert.match(message, /Dependency Lockfile Guard/);
  assert.match(message, /blockingContract/);
  assert.match(message, /unblockWhen/);
});

// ── protected-paths ────────────────────────────────────────────────────

test("protected paths: vendor/ package dir is denied", () => {
  const reason = protectedPathViolation("/repo/vendor/symfony/console/src/App.php");
  assert.match(reason, /vendor\//);
});

test("protected paths: vendor/autoload.php is denied", () => {
  assert.ok(protectedPathViolation("/repo/vendor/autoload.php"));
});

test("protected paths: vendor/composer/ is denied", () => {
  assert.ok(protectedPathViolation("/repo/vendor/composer/installed.json"));
});

test("protected paths: .phpunit.result.cache is denied", () => {
  assert.ok(protectedPathViolation("/repo/.phpunit.result.cache"));
});

test("protected paths: normal source files are allowed", () => {
  assert.equal(protectedPathViolation("/repo/src/App.php"), null);
  assert.equal(protectedPathViolation("/repo/vendor.php"), null);
});

test("protected paths: deny message contains blockingContract and recovery", () => {
  const message = protectedPathDenyMessage("/repo/vendor/autoload.php", "generated");
  assert.match(message, /Protected Path/);
  assert.match(message, /blockingContract/);
  assert.match(message, /composer/);
});

// ── test-truncation ────────────────────────────────────────────────────

test("truncation: phpunit | tail -5 is flagged", () => {
  assert.equal(truncationHit("vendor/bin/phpunit | tail -5"), 5);
});

test("truncation: phpstan | head -n 20 is flagged", () => {
  assert.equal(truncationHit("phpstan analyse src | head -n 20"), 20);
});

test("truncation: tail -1 single-line summary is allowed", () => {
  assert.equal(truncationHit("vendor/bin/phpunit | tail -1"), null);
});

test("truncation: non-PHP heavy commands are ignored", () => {
  assert.equal(truncationHit("ls -la | tail -10"), null);
});

test("truncation: report message is actionable", () => {
  const message = truncationReportMessage(5);
  assert.match(message, /Test Truncation/);
  assert.match(message, /tail\/head -5/);
});

// ── entry smoke test (subprocess, stdin → stdout JSON) ─────────────────

function runHook(script, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("repositories: apply_patch lowercase tool name (Codex) is denied", () => {
  const hits = collectRepositoriesHits({
    toolName: "apply_patch",
    input: {
      patch: [
        "*** Begin Patch",
        "*** Update File: composer.json",
        "@@",
        '+    "repositories": {"local": {"type": "path", "url": "../x"}},',
      ].join("\n"),
    },
  });
  assert.deepEqual(hits, ["patch:composer.json"]);
});

test("entry: apply_patch lowercase yields deny JSON", async () => {
  const { code, stdout } = await runHook(PRE_TOOL, {
    tool_name: "apply_patch",
    tool_input: {
      patch: [
        "*** Begin Patch",
        "*** Update File: composer.json",
        "@@",
        '+  "repositories": {},',
      ].join("\n"),
    },
  });
  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Repositories Guard/);
});

test("entry: Edit composer.json with repositories key yields deny JSON", async () => {
  const { code, stdout } = await runHook(PRE_TOOL, {
    tool_name: "Edit",
    tool_input: {
      file_path: "composer.json",
      new_string: '"repositories": {},',
    },
  });
  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Repositories Guard/);
});

test("entry: clean Write yields no output", async () => {
  const { code, stdout } = await runHook(PRE_TOOL, {
    tool_name: "Write",
    tool_input: { file_path: "src/App.php", content: "<?php\n" },
  });
  assert.equal(code, 0);
  assert.equal(stdout, "");
});

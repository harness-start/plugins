import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const policyModule = await import(new URL("../../hooks/project-dist-write-guard.mjs", import.meta.url).href);
const { evaluateEvent } = policyModule;

function event(toolName: string, toolInput: Record<string, unknown>, cwd = projectRoot) {
  return { cwd, tool_name: toolName, tool_input: toolInput };
}

test("denies file-tool writes only inside a plugin dist directory", () => {
  const protectedFile = path.join(projectRoot, "plugins/example-plugin/dist/index.mjs");

  assert.equal(evaluateEvent(event("Write", { file_path: protectedFile })).deny, true);
  assert.equal(evaluateEvent(event("Edit", { file_path: "plugins/example-plugin/dist/index.mjs" })).deny, true);
  assert.equal(evaluateEvent(event("Write", { file_path: "plugins/example-plugin/src/index.ts" })).deny, false);
  assert.equal(evaluateEvent(event("Write", { file_path: "plugins/example-plugin/dist-other/index.mjs" })).deny, false);
  assert.equal(evaluateEvent(event("Write", { file_path: "plugins/example-plugin/src/dist/index.mjs" })).deny, false);
  assert.equal(evaluateEvent(event("Write", { file_path: "plugins/example-plugin/dist/index.mjs" }, "/tmp")).deny, false);
});

test("denies patch operations that add, update, delete, or move plugin dist files", () => {
  const patchText = [
    "*** Begin Patch",
    "*** Update File: plugins/example-plugin/dist/index.mjs",
    "@@",
    "-old",
    "+new",
    "*** End Patch",
  ].join("\n");

  assert.equal(evaluateEvent(event("apply_patch", { patch: patchText })).deny, true);
  assert.equal(evaluateEvent(event("apply_patch", {
    patch: "*** Move to: plugins/example-plugin/dist/renamed.mjs",
  })).deny, true);
  assert.equal(evaluateEvent(event("apply_patch", {
    patch: "*** Update File: plugins/example-plugin/src/index.ts",
  })).deny, false);
});

test("denies explicit shell writes to plugin dist while allowing builds and reads", () => {
  const deniedCommands = [
    "printf '%s' output > plugins/example-plugin/dist/index.mjs",
    "printf '%s' output>plugins/example-plugin/dist/index.mjs",
    "printf '%s' output | tee plugins/example-plugin/dist/index.mjs",
    "cd plugins/example-plugin && sed -i 's/a/b/' dist/index.mjs",
    "cp /tmp/index.mjs plugins/example-plugin/dist/index.mjs",
    "rm -f plugins/example-plugin/dist/index.mjs",
    "node -e \"require('fs').writeFileSync('plugins/example-plugin/dist/index.mjs', 'x')\"",
    "cd plugins/example-plugin/dist && touch generated.mjs",
    "esbuild src/index.ts --outfile plugins/example-plugin/dist/index.mjs",
    "esbuild src/index.ts --outdir plugins/example-plugin/dist",
    "printf x > \"$(git rev-parse --show-toplevel)/plugins/example-plugin/dist/index.mjs\"",
  ];

  for (const command of deniedCommands) {
    assert.equal(evaluateEvent(event("exec_command", { cmd: command })).deny, true, command);
  }

  const allowedCommands = [
    "npm run build",
    "npm run check:dist",
    "node scripts/build-plugins.ts",
    "rg 'export' plugins/example-plugin/dist/index.mjs",
    "sed -n '1,5p' plugins/example-plugin/dist/index.mjs",
    "perl -ne 'print' plugins/example-plugin/dist/index.mjs",
    "cp plugins/example-plugin/dist/index.mjs /tmp/index.mjs",
    "printf '%s' output > plugins/example-plugin/dist-other/index.mjs",
  ];

  for (const command of allowedCommands) {
    assert.equal(evaluateEvent(event("Bash", { command })).deny, false, command);
  }
});

test("covers Codex write_stdin commands without treating malformed input as a write", () => {
  assert.equal(evaluateEvent(event("write_stdin", {
    chars: "touch plugins/example-plugin/dist/index.mjs\n",
  })).deny, true);

  for (const wrapperPath of [
    ".claude/hooks/project-dist-write-guard.mjs",
    ".codex/hooks/project-dist-write-guard.mjs",
  ]) {
    const result = spawnSync(process.execPath, [path.join(projectRoot, wrapperPath)], {
      cwd: projectRoot,
      encoding: "utf8",
      input: "{",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /malformed hook input; fail-open/u);
  }

  const codexConfig = readFileSync(path.join(projectRoot, ".codex/hooks.json"), "utf8");
  assert.match(codexConfig, /write_stdin/u);
});

test("project hook registrations stay platform-scoped and invoke the guard", () => {
  const registrations = [
    [".claude/settings.json", ".claude/hooks/project-dist-write-guard.mjs", ".codex/hooks/"],
    [".codex/hooks.json", ".codex/hooks/project-dist-write-guard.mjs", ".claude/hooks/"],
  ] as const;

  for (const [configPath, wrapperPath, foreignHookDirectory] of registrations) {
    const configText = readFileSync(path.join(projectRoot, configPath), "utf8");
    const config = JSON.parse(configText) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
    };
    const command = config.hooks.PreToolUse[0]?.hooks[0]?.command ?? "";

    assert.match(command, new RegExp(wrapperPath.replaceAll(".", "\\.")));
    assert.doesNotMatch(command, new RegExp(foreignHookDirectory.replaceAll(".", "\\.")));

    const result = spawnSync(process.execPath, [path.join(projectRoot, wrapperPath)], {
      cwd: projectRoot,
      encoding: "utf8",
      input: JSON.stringify(event("Write", {
        file_path: "plugins/example-plugin/dist/index.mjs",
      })),
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      hookSpecificOutput: {
        hookEventName: string;
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /插件 dist\/ 是构建产物/u);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract:/u);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /npm run build/u);
  }
});

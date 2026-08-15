import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const policyModule = await import(new URL("../../hooks/project-dist-write-guard.mjs", import.meta.url).href);
const { evaluateEvent, runHook } = policyModule;

function event(toolName: string, toolInput: Record<string, unknown>, cwd = projectRoot) {
  return { cwd, tool_name: toolName, tool_input: toolInput };
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

function expectedSourceHash(pluginName: string): string {
  const sourceFiles = [
    ...filesUnder(path.join(projectRoot, "plugins", pluginName, "src"))
      .filter((filePath) => filePath.endsWith(".ts")),
    ...filesUnder(path.join(projectRoot, "core", "src"))
      .filter((filePath) => filePath.endsWith(".ts")),
  ].sort();
  const hash = createHash("sha256");
  for (const filePath of sourceFiles) {
    const projectPath = path.relative(projectRoot, filePath).split(path.sep).join("/");
    const contents = readFileSync(filePath);
    hash.update(`${Buffer.byteLength(projectPath)}:${projectPath}\0${contents.byteLength}:`);
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

test("every generated plugin runtime records the hash of its current sources", () => {
  const pluginNames = readdirSync(path.join(projectRoot, "plugins"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(path.join(projectRoot, "plugins", entry.name, "dist")))
    .map((entry) => entry.name);

  assert.ok(pluginNames.length > 0);
  for (const pluginName of pluginNames) {
    const sourceHash = expectedSourceHash(pluginName);
    const runtimeFiles = filesUnder(path.join(projectRoot, "plugins", pluginName, "dist"))
      .filter((filePath) => filePath.endsWith(".mjs"));
    for (const filePath of runtimeFiles) {
      const firstLines = readFileSync(filePath, "utf8").split("\n").slice(0, 3).join("\n");
      assert.match(firstLines, new RegExp(`(?:^|\\n)// harness-source-hash: sha256:${sourceHash}(?:\\n|$)`, "u"), filePath);
    }
  }
});

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

test("recognizes project remote pushes without intercepting unrelated repositories", () => {
  const pushCommands = [
    "git push origin main",
    "command git -c push.autoSetupRemote=true push",
    `git -C ${projectRoot} push`,
    "git send-pack origin refs/heads/main",
    "cd plugins/git-delivery-guards && git push",
  ];

  for (const command of pushCommands) {
    assert.equal(evaluateEvent(event("Bash", { command })).ensureDist, true, command);
  }

  const unrelatedCommands = [
    "printf '%s' 'git push'",
    "git status",
    "git fetch origin",
    "git -C /tmp push",
    "cd /tmp && git push",
  ];
  for (const command of unrelatedCommands) {
    assert.notEqual(evaluateEvent(event("exec_command", { cmd: command })).ensureDist, true, command);
  }
});

test("a rebuilt dist blocks the current push until generated files are committed", async () => {
  let ensureCalls = 0;
  let stdout = "";
  await runHook(Readable.from([JSON.stringify(event("Bash", { command: "git push origin main" }))]), {
    ensureProjectDist: async () => {
      ensureCalls += 1;
      return { status: "rebuilt", details: "rebuilt example-plugin" };
    },
    writeStdout: (value: string) => { stdout += value; },
  });

  assert.equal(ensureCalls, 1);
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /已自动重建/u);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /提交.*dist.*重试.*push/u);
});

test("a failed dist rebuild blocks push with a verifiable recovery command", async () => {
  let stdout = "";
  await runHook(Readable.from([JSON.stringify(event("Bash", { command: "git push" }))]), {
    ensureProjectDist: async () => ({ status: "failed", details: "synthetic build failure" }),
    writeStdout: (value: string) => { stdout += value; },
  });

  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /synthetic build failure/u);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /npm run ensure:dist/u);
});

test("current but uncommitted dist files block push", async () => {
  let stdout = "";
  await runHook(Readable.from([JSON.stringify(event("Bash", { command: "git push" }))]), {
    ensureProjectDist: async () => ({
      status: "uncommitted",
      details: " M plugins/example-plugin/dist/index.mjs",
    }),
    writeStdout: (value: string) => { stdout += value; },
  });

  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /尚未全部提交/u);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /git status/u);
});

test("a current and committed dist allows push without hook output", async () => {
  let stdout = "";
  await runHook(Readable.from([JSON.stringify(event("Bash", { command: "git push" }))]), {
    ensureProjectDist: async () => ({ status: "current", details: "" }),
    writeStdout: (value: string) => { stdout += value; },
  });

  assert.equal(stdout, "");
});

test("project hook registrations stay platform-scoped and invoke the guard", () => {
  const registrations = [
    [".claude/settings.json", ".claude/hooks/project-dist-write-guard.mjs", ".codex/hooks/"],
    [".codex/hooks.json", ".codex/hooks/project-dist-write-guard.mjs", ".claude/hooks/"],
  ] as const;

  for (const [configPath, wrapperPath, foreignHookDirectory] of registrations) {
    const configText = readFileSync(path.join(projectRoot, configPath), "utf8");
    const config = JSON.parse(configText) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string; timeout: number }> }> };
    };
    const hook = config.hooks.PreToolUse[0]?.hooks[0];
    const command = hook?.command ?? "";

    assert.match(command, new RegExp(wrapperPath.replaceAll(".", "\\.")));
    assert.doesNotMatch(command, new RegExp(foreignHookDirectory.replaceAll(".", "\\.")));
    assert.ok((hook?.timeout ?? 0) >= 120);

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

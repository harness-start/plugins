import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  extractFileTargets,
  extractShellCommand,
  isFileMutationTool,
  isReadTool,
  isShellTool,
} from "@harness/core/hook-targets";

test("extracts a Claude Write path against the event cwd", () => {
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "Write",
    tool_input: { file_path: "src/main.ts" },
  }), [resolve("/workspace", "src/main.ts")]);
});

test("treats Codex create_file and search_replace as mutations", () => {
  assert.equal(isFileMutationTool("create_file"), true);
  assert.equal(isFileMutationTool("search_replace"), true);
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    toolName: "create_file",
    toolInput: { path: "lib/new.js" },
  }), [resolve("/workspace", "lib/new.js")]);
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "search_replace",
    tool_input: { filePath: "lib/old.js" },
  }), [resolve("/workspace", "lib/old.js")]);
});

test("unions apply_patch object paths with patch headers and move targets", () => {
  const paths = extractFileTargets({
    cwd: "/workspace",
    tool_name: "apply_patch",
    tool_input: {
      file_path: "src/kept.ts",
      patch: [
        "*** Begin Patch",
        "*** Update File: src/updated.ts",
        "*** Move to: \"src/moved.ts\"",
        "*** End Patch",
      ].join("\n"),
    },
  });
  assert.deepEqual(new Set(paths), new Set([
    resolve("/workspace", "src/kept.ts"),
    resolve("/workspace", "src/updated.ts"),
    resolve("/workspace", "src/moved.ts"),
  ]));
});

test("extracts notebook and MultiEdit nested paths", () => {
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "NotebookEdit",
    tool_input: { notebook_path: "notes/a.ipynb" },
  }), [resolve("/workspace", "notes/a.ipynb")]);
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "MultiEdit",
    tool_input: { edits: [{ file_path: "a.ts" }, { filePath: "b.ts" }] },
  }), [resolve("/workspace", "a.ts"), resolve("/workspace", "b.ts")]);
});

test("reads shell command from command, cmd, or script and ignores event.name", () => {
  assert.equal(isShellTool("exec_command"), true);
  assert.equal(extractShellCommand({
    name: "PreToolUse",
    tool_name: "exec_command",
    tool_input: { script: "git status" },
  }), "git status");
  assert.equal(extractShellCommand({
    tool_name: "Bash",
    tool_input: { cmd: "ls" },
  }), "ls");
  assert.equal(extractShellCommand({
    name: "Bash",
    tool_input: { command: "rm -rf /" },
  }), null);
});

test("Read is excluded from mutation targets unless read-or-mutation is requested", () => {
  assert.equal(isReadTool("Read"), true);
  const event = {
    cwd: "/workspace",
    tool_name: "Read",
    tool_input: { file_path: "src/secret.ts" },
  };
  assert.deepEqual(extractFileTargets(event), []);
  assert.deepEqual(extractFileTargets(event, { tools: "read-or-mutation" }), [
    resolve("/workspace", "src/secret.ts"),
  ]);
});

test("optional shell writes work without a shell tool name", () => {
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_input: { command: "printf x > \"out.txt\"" },
  }, { tools: "any", includeShellWrites: true }), [resolve("/workspace", "out.txt")]);
});

test("optional shell writes collect redirect, tee, and touch targets", () => {
  const paths = extractFileTargets({
    cwd: "/workspace",
    tool_name: "Bash",
    tool_input: { command: "echo x > out.txt && tee captured.log && touch ready.flag" },
  }, { includeShellWrites: true });
  assert.deepEqual(new Set(paths), new Set([
    resolve("/workspace", "out.txt"),
    resolve("/workspace", "captured.log"),
    resolve("/workspace", "ready.flag"),
  ]));
});

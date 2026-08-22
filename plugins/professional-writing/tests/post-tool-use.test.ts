import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const entry = resolve(root, "dist/hooks/professional-writing.mjs");

function runPost(
  event: Record<string, unknown>,
  env: Record<string, string>,
) {
  return spawnSync(process.execPath, [entry, "post"], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function withWorkspace(run: (workspace: string) => void): void {
  const workspace = mkdtempSync(join(tmpdir(), "professional-writing-post-"));
  try {
    run(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("Claude PostToolUse reports analyzer findings after a Markdown write without Skill loading", () => {
  withWorkspace((workspace) => {
    const target = join(workspace, "release-note.md");
    writeFileSync(target, "In conclusion, I hope this helps.\n");

    const result = runPost(
      { cwd: workspace, tool_name: "Write", tool_input: { file_path: target } },
      { CLAUDE_PLUGIN_ROOT: root, HARNESS_HOST: "claude", PLUGIN_ROOT: "" },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, "PostToolUse");
    assert.match(output.additionalContext, /Markdown AI-style findings/iu);
    assert.match(output.additionalContext, /release-note\.md:1/iu);
    assert.match(output.additionalContext, /en-canned-closer|en-assistant-residue/iu);
    assert.equal("permissionDecision" in output, false);
  });
});

test("Codex PostToolUse returns model-visible tool feedback without blocking the write", () => {
  withWorkspace((workspace) => {
    const target = join(workspace, "release-note.md");
    writeFileSync(target, "值得注意的是，本文将赋能团队。\n");

    const result = runPost(
      { cwd: workspace, tool_name: "Edit", tool_input: { file_path: target } },
      { HARNESS_HOST: "codex", PLUGIN_ROOT: root },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.continue, false);
    assert.match(output.stopReason, /review feedback/iu);
    assert.match(output.reason, /Markdown AI-style findings/iu);
    assert.match(output.reason, /release-note\.md:1/iu);
    assert.match(output.reason, /zh-meta-transition|zh-assistant-residue/iu);
    assert.equal("decision" in output, false);
  });
});

test("PostToolUse stays silent for concrete prose and non-Markdown writes", () => {
  withWorkspace((workspace) => {
    const markdown = join(workspace, "release-note.md");
    const source = join(workspace, "release-note.ts");
    writeFileSync(markdown, "The cache stores the compiled module graph.\n");
    writeFileSync(source, "export const message = 'In conclusion';\n");

    for (const target of [markdown, source]) {
      const result = runPost(
        { cwd: workspace, tool_name: "Write", tool_input: { file_path: target } },
        { CLAUDE_PLUGIN_ROOT: root, HARNESS_HOST: "claude", PLUGIN_ROOT: "" },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", target);
    }
  });
});

test("PostToolUse resolves explicit shell write targets", () => {
  withWorkspace((workspace) => {
    const target = join(workspace, "notes.md");
    writeFileSync(target, "In today's rapidly evolving landscape, this article explores caching.\n");

    const result = runPost(
      {
        cwd: workspace,
        tool_name: "exec_command",
        tool_input: { cmd: "printf updated > notes.md" },
      },
      { CLAUDE_PLUGIN_ROOT: root, HARNESS_HOST: "claude", PLUGIN_ROOT: "" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /notes\.md:1/iu);
  });
});

test("PostToolUse resolves sed in-place Markdown targets", () => {
  withWorkspace((workspace) => {
    const target = join(workspace, "notes.md");
    writeFileSync(target, "In conclusion, I hope this helps.\n");

    const result = runPost(
      {
        cwd: workspace,
        tool_name: "exec_command",
        tool_input: { cmd: "sed -i 's/PLACEHOLDER/In conclusion, I hope this helps./' notes.md && cat notes.md" },
      },
      { HARNESS_HOST: "codex", PLUGIN_ROOT: root },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).reason, /notes\.md:1/iu);
  });
});

test("PostToolUse resolves apply_patch targets", () => {
  withWorkspace((workspace) => {
    const target = join(workspace, "notes.md");
    writeFileSync(target, "In conclusion, the cache is ready.\n");

    const result = runPost(
      {
        cwd: workspace,
        tool_name: "apply_patch",
        tool_input: { patch: "*** Begin Patch\n*** Update File: notes.md\n*** End Patch" },
      },
      { CLAUDE_PLUGIN_ROOT: root, HARNESS_HOST: "claude", PLUGIN_ROOT: "" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /notes\.md:1/iu);
  });
});

test("Codex PostToolUse recovers apply_patch targets from response changes", () => {
  withWorkspace((workspace) => {
    const target = join(workspace, "notes.md");
    writeFileSync(target, "In conclusion, the cache is ready.\n");

    const result = runPost(
      {
        cwd: workspace,
        tool_name: "apply_patch",
        tool_input: {},
        tool_response: {
          success: true,
          changes: {
            [target]: { type: "update" },
          },
        },
      },
      { HARNESS_HOST: "codex", PLUGIN_ROOT: root },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(JSON.parse(result.stdout).reason, /notes\.md:1/iu);
  });
});

test("PostToolUse skips generated directories and reports an oversized observed file", () => {
  withWorkspace((workspace) => {
    const generatedDir = join(workspace, "dist");
    mkdirSync(generatedDir);
    const generated = join(generatedDir, "generated.md");
    writeFileSync(generated, "In conclusion, generated prose.\n");
    const generatedResult = runPost(
      { cwd: workspace, tool_name: "Write", tool_input: { file_path: generated } },
      { CLAUDE_PLUGIN_ROOT: root, HARNESS_HOST: "claude", PLUGIN_ROOT: "" },
    );
    assert.equal(generatedResult.status, 0, generatedResult.stderr);
    assert.equal(generatedResult.stdout, "");

    const oversized = join(workspace, "oversized.md");
    writeFileSync(oversized, "x".repeat((256 * 1024) + 1));
    const oversizedResult = runPost(
      { cwd: workspace, tool_name: "Write", tool_input: { file_path: oversized } },
      { CLAUDE_PLUGIN_ROOT: root, HARNESS_HOST: "claude", PLUGIN_ROOT: "" },
    );
    assert.equal(oversizedResult.status, 0, oversizedResult.stderr);
    assert.match(JSON.parse(oversizedResult.stdout).hookSpecificOutput.additionalContext, /256 KiB|262144-byte/iu);
  });
});

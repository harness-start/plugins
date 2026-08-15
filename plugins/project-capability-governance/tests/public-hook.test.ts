import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(
  new URL("../dist/hooks/project-capability-governance-hook.mjs", import.meta.url),
);

function proposal(id, revision = 1) {
  return [
    "---",
    `proposal_id: ${id}`,
    `proposal_revision: ${revision}`,
    "kind: sop",
    "title: Repeatable release verification",
    "status: pending",
    "---",
    "",
    "## Evidence",
    "",
    "- release run A",
    "- release run B",
    "",
    "## Reuse scenarios",
    "",
    "- service release",
    "- library release",
    "",
    "## Acceptance",
    "",
    "- verification command and expected outcome are recorded",
    "",
    "## Counterexample",
    "",
    "- a one-off deployment does not qualify",
    "",
  ].join("\n");
}

function runHook(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, "codex"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function output(result) {
  const line = result.stdout.trim();
  return line ? JSON.parse(line.split("\n").at(-1)) : null;
}

function pendingPath(root) {
  return join(root, ".project-capabilities", "inbox", "pending");
}

test("SessionStart describes parent-owned proposals and optional generic advice", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-session-"));
  try {
    const result = await runHook("session", { cwd: root, session_id: "session" });
    assert.equal(result.code, 0, result.stderr);
    const context = output(result)?.hookSpecificOutput?.additionalContext ?? "";
    assert.match(context, /parent agent may create one schema-valid pending proposal directly/iu);
    assert.match(context, /ordinary read-only subagent.*plain language/iu);
    assert.match(context, /no plugin-defined identity, reservation, lifecycle, write authority, or approval power/iu);
    assert.doesNotMatch(context, /PROJECT_CAPABILITY_RECORDER|nonce|reserve --/u);
    assert.equal(existsSync(join(root, ".project-capabilities")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("any parent-owned file tool may create one schema-valid pending proposal", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-write-"));
  const base = { cwd: root, session_id: "write-session" };
  try {
    await runHook("session", base);
    const target = join(pendingPath(root), "pc-release-check.md");
    const accepted = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: { file_path: target, content: proposal("pc-release-check") },
    });
    assert.equal(output(accepted), null, accepted.stdout || accepted.stderr);
    assert.equal(readFileSync(join(root, ".project-capabilities", ".gitignore"), "utf8"), "*\n");

    const invalid = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: {
        file_path: join(pendingPath(root), "pc-one-off.md"),
        content: proposal("pc-one-off").replace("- release run B\n", ""),
      },
    });
    assert.equal(output(invalid)?.hookSpecificOutput?.permissionDecision, "deny");

    writeFileSync(target, proposal("pc-release-check"));
    const overwrite = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: { file_path: target, content: proposal("pc-release-check", 2) },
    });
    assert.equal(output(overwrite)?.hookSpecificOutput?.permissionDecision, "deny");

    const outside = join(root, "outside.md");
    writeFileSync(outside, "outside\n");
    const link = join(pendingPath(root), "pc-linked.md");
    symlinkSync(outside, link);
    const symlink = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: { file_path: link, content: proposal("pc-linked") },
    });
    assert.equal(output(symlink)?.hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("PreToolUse rejects non-canonical and direct shell mutations under the inbox", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-path-"));
  const base = { cwd: root, session_id: "path-session" };
  try {
    await runHook("session", base);
    const nested = join(pendingPath(root), "nested", "pc-hidden.md");
    const nonCanonical = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: { file_path: nested, content: proposal("pc-hidden") },
    });
    assert.equal(output(nonCanonical)?.hookSpecificOutput?.permissionDecision, "deny");

    const shellMutation = await runHook("pre", {
      ...base,
      tool_name: "exec_command",
      tool_input: { cmd: "touch pc-bypass.md", workdir: pendingPath(root) },
    });
    assert.equal(output(shellMutation)?.hookSpecificOutput?.permissionDecision, "deny");

    const inspection = await runHook("pre", {
      ...base,
      tool_name: "exec_command",
      tool_input: { cmd: "find .project-capabilities/inbox -type f -name '*.md' -print", workdir: root },
    });
    assert.equal(output(inspection), null, inspection.stdout || inspection.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Stop emits one human-only non-blocking notice for each new revision", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-stop-"));
  const pending = pendingPath(root);
  mkdirSync(pending, { recursive: true });
  const target = join(pending, "pc-release-check.md");
  writeFileSync(target, proposal("pc-release-check"));
  const event = { cwd: root, session_id: "notice-session" };
  try {
    const first = output(await runHook("stop", event))?.systemMessage ?? "";
    assert.match(first, /audience="human"/u);
    assert.match(first, /blocking="false"/u);
    assert.equal((await runHook("stop", event)).stdout, "");
    writeFileSync(target, proposal("pc-release-check", 2));
    assert.match(output(await runHook("stop", event))?.systemMessage ?? "", /1 new capability proposal/iu);
    unlinkSync(target);
    assert.equal((await runHook("stop", event)).stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

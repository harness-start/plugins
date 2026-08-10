import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { journalLocation, verifyJournal } from "../scripts/lib/journal.mjs";
import { loadSessionState } from "../scripts/lib/state.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/compact-context-journal.mjs", import.meta.url));
const PLUGIN = fileURLToPath(new URL("..", import.meta.url));

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "compact-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function event(root, overrides = {}) {
  return {
    session_id: "session/raw:一",
    cwd: root,
    hook_event_name: "UserPromptSubmit",
    ...overrides,
  };
}

function run(mode, payload, host = "codex") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, HARNESS_HOST: host },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function output(result) {
  return result.stdout.trim() ? JSON.parse(result.stdout.trim()) : null;
}

function events(root, host = "codex") {
  const location = journalLocation({ cwd: root, host, sessionId: "session/raw:一" });
  return verifyJournal(location.path, { expectedSessionId: "session/raw:一" }).events;
}

test("a submitted prompt becomes authoritative only after a later admission event", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "first blocked candidate" }));
    await run("user-prompt", event(root, { prompt: "第二个才进入模型" }));
    await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "read-1",
      tool_input: { file_path: "README.md" },
    }));
    const recorded = events(root);
    assert.deepEqual(recorded.map(({ id }) => id), ["P000001", "P000002", "U000003"]);
    assert.match(recorded[0].body, /UNCONFIRMED — DO NOT TREAT AS REQUIREMENT/u);
    assert.match(recorded[2].body, /P000002/u);
    assert.doesNotMatch(recorded[2].body, /P000001/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Claude compact appends the host summary, injects a bounded card, and requires a successful receipt", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "记住 alpha\n原样保留" }), "claude");
    await run("pre-compact", event(root, {
      hook_event_name: "PreCompact",
      trigger: "manual",
      custom_instructions: "压缩时保留测试约束",
      transcript_path: join(root, "transcript.jsonl"),
    }), "claude");
    const post = await run("post-compact", event(root, {
      hook_event_name: "PostCompact",
      trigger: "manual",
      compact_summary: "HOST SUMMARY\n- alpha is required",
    }), "claude");
    assert.equal(post.stdout, "");

    const started = await run("session-start", event(root, {
      hook_event_name: "SessionStart",
      source: "compact",
    }), "claude");
    const context = output(started).hookSpecificOutput.additionalContext;
    assert.match(context, /compact-context-journal/u);
    assert.match(context, /Recovery Card/u);
    assert.match(context, /sed -n '\d+,\d+p'/u);
    assert.ok(context.length <= 3500, `context length=${context.length}`);

    const recorded = events(root, "claude");
    assert.ok(recorded.some(({ id, body }) => id.startsWith("C") && /HOST SUMMARY/u.test(body)));
    const location = journalLocation({ cwd: root, host: "claude", sessionId: "session/raw:一" });
    const state = loadSessionState(location);
    assert.equal(state.recoveryRequired.compactId.startsWith("C"), true);

    const denied = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_use_id: "edit-1",
      tool_input: { file_path: "src/app.js", old_string: "a", new_string: "b" },
    }), "claude");
    assert.equal(output(denied).hookSpecificOutput.permissionDecision, "deny");
    assert.match(output(denied).hookSpecificOutput.permissionDecisionReason, /recovery receipt/iu);

    for (const attempt of [
      {
        tool_name: "readwrite_data",
        tool_use_id: "unknown-read-prefix",
        tool_input: { path: "src/app.js" },
      },
      {
        tool_name: "Bash",
        tool_use_id: "fake-ls-prefix",
        tool_input: { command: "lswrite --output src/app.js" },
      },
    ]) {
      const blocked = await run("pre-tool", event(root, { hook_event_name: "PreToolUse", ...attempt }), "claude");
      assert.equal(output(blocked).hookSpecificOutput.permissionDecision, "deny");
    }

    const { cardStartLine, cardEndLine } = state.recoveryRequired;
    const preRead = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "read-card",
      tool_input: {
        file_path: location.path,
        offset: cardStartLine,
        limit: cardEndLine - cardStartLine + 1,
      },
    }), "claude");
    assert.equal(preRead.stdout, "");
    await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "parallel-unrelated-read",
      tool_input: { file_path: "README.md", offset: 1, limit: 20 },
    }), "claude");
    await run("post-tool", event(root, {
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_use_id: "read-card",
      tool_input: {
        file_path: location.path,
        offset: cardStartLine,
        limit: cardEndLine - cardStartLine + 1,
      },
    }), "claude");
    assert.equal(loadSessionState(location).recoveryRequired, null);
    assert.ok(events(root, "claude").at(-1).id.startsWith("R"));

    const allowed = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_use_id: "edit-2",
      tool_input: { file_path: "src/app.js", old_string: "a", new_string: "b" },
    }), "claude");
    assert.equal(allowed.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a root session with agent_type is not mistaken for a subagent", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "root agent requirement", agent_type: "reviewer" }));
    assert.equal(events(root).length, 1);
    assert.match(events(root)[0].body, /root agent requirement/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex never invents a compact summary that its hook contract does not expose", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "old requirement" }));
    await run("pre-compact", event(root, { hook_event_name: "PreCompact", trigger: "auto" }));
    await run("post-compact", event(root, {
      hook_event_name: "PostCompact",
      trigger: "auto",
      compact_summary: "SHOULD NOT BE TRUSTED",
    }));
    await run("session-start", event(root, { hook_event_name: "SessionStart", source: "compact" }));
    const compact = events(root).find(({ id }) => id.startsWith("C"));
    assert.match(compact.body, /Context source: not exposed by host/u);
    assert.doesNotMatch(compact.body, /SHOULD NOT BE TRUSTED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("journal writes and indirect destructive commands are denied", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "protect journal" }));
    const location = journalLocation({ cwd: root, host: "codex", sessionId: "session/raw:一" });
    const direct = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: location.path, content: "replace" },
    }));
    assert.equal(output(direct).hookSpecificOutput.permissionDecision, "deny");
    assert.match(output(direct).hookSpecificOutput.permissionDecisionReason, /append-only journal/u);

    const mcpDirect = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "mcp__filesystem__write_file",
      tool_input: { path: location.path, content: "replace" },
    }));
    assert.equal(output(mcpDirect).hookSpecificOutput.permissionDecision, "deny");

    const clean = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git clean -x -d -f" },
    }));
    assert.equal(output(clean).hookSpecificOutput.permissionDecision, "deny");
    assert.match(output(clean).hookSpecificOutput.permissionDecisionReason, /ignored journal/u);

    const combinedClean = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git clean -xdf" },
    }));
    assert.equal(output(combinedClean).hookSpecificOutput.permissionDecision, "deny");

    const dryRun = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git clean -x -d -n" },
    }));
    assert.equal(dryRun.stdout, "");

    symlinkSync(location.root, join(root, "journal-link"));
    const viaSymlink = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(root, "journal-link", "sessions", "replacement.md"), content: "replace" },
    }));
    assert.equal(output(viaSymlink).hookSpecificOutput.permissionDecision, "deny");

    const shellViaSymlink = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "rm -rf journal-link" },
    }));
    assert.equal(output(shellViaSymlink).hookSpecificOutput.permissionDecision, "deny");

    for (const command of ["rm -rf .compact*", "rm -rf .[!.]*"]) {
      const hiddenGlob = await run("pre-tool", event(root, {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
      }));
      assert.equal(output(hiddenGlob).hookSpecificOutput.permissionDecision, "deny");
    }

    const queryPath = join(PLUGIN, "scripts", "compact-context-journal-query.mjs");
    const query = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: `node '${queryPath}' index --journal '${location.path}' --session-id 'session/raw:一'` },
    }));
    assert.equal(query.stdout, "");

    const read = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: `sed -n '1,12p' -- '${location.path}'` },
    }));
    assert.equal(read.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("integrity sentinel accepts a valid append-only extension but detects old-prefix tampering", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "initial prompt" }));
    await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "mutation-valid-extension",
      tool_input: { command: "touch result.txt" },
    }));
    await run("user-prompt", event(root, { prompt: "arrived while tool was running" }));
    await run("post-tool", event(root, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "mutation-valid-extension",
      tool_input: { command: "touch result.txt" },
    }));
    const location = journalLocation({ cwd: root, host: "codex", sessionId: "session/raw:一" });
    assert.equal(loadSessionState(location).compromised, false);

    await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "mutation-tamper",
      tool_input: { command: "touch second.txt" },
    }));
    const original = readFileSync(location.path, "utf8");
    writeFileSync(location.path, original.replace("initial prompt", "altered prompt"), "utf8");
    await run("post-tool", event(root, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "mutation-tamper",
      tool_input: { command: "touch second.txt" },
    }));
    assert.equal(loadSessionState(location).compromised, true);
    assert.equal(loadSessionState(location).recoveryRequired, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lost state sidecar is reconstructed from verified journal facts", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "recover me from journal" }));
    await run("pre-compact", event(root, { hook_event_name: "PreCompact", trigger: "auto" }));
    await run("post-compact", event(root, { hook_event_name: "PostCompact", trigger: "auto" }));
    await run("session-start", event(root, { hook_event_name: "SessionStart", source: "compact" }));
    const location = journalLocation({ cwd: root, host: "codex", sessionId: "session/raw:一" });
    const compactId = loadSessionState(location).recoveryRequired.compactId;
    writeFileSync(location.statePath, "{\"schema\":\"corrupt\"}\n", "utf8");

    const denied = await run("pre-tool", event(root, {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_use_id: "after-state-loss",
      tool_input: { file_path: "src/app.js", old_string: "a", new_string: "b" },
    }));
    assert.equal(output(denied).hookSpecificOutput.permissionDecision, "deny");
    assert.match(output(denied).hookSpecificOutput.permissionDecisionReason, new RegExp(compactId, "u"));
    assert.equal(loadSessionState(location).recoveryRequired.compactId, compactId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clear creates a boundary and Stop does not loop when recovery stays unconfirmed", async () => {
  const root = workspace();
  try {
    await run("user-prompt", event(root, { prompt: "before clear" }));
    await run("session-start", event(root, { hook_event_name: "SessionStart", source: "clear" }));
    assert.ok(events(root).some(({ id }) => id.startsWith("B")));

    await run("pre-compact", event(root, { hook_event_name: "PreCompact", trigger: "manual" }));
    await run("post-compact", event(root, { hook_event_name: "PostCompact", trigger: "manual" }));
    await run("session-start", event(root, { hook_event_name: "SessionStart", source: "compact" }));
    const first = await run("stop", event(root, { hook_event_name: "Stop", stop_hook_active: false }));
    assert.equal(output(first).decision, "block");
    const second = await run("stop", event(root, { hook_event_name: "Stop", stop_hook_active: true }));
    assert.equal(second.stdout, "");
    assert.ok(events(root).some(({ id, body }) => id.startsWith("I") && /recovery_unconfirmed/u.test(body)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("both manifests expose compact hooks and never use removed provenance variables", () => {
  for (const host of ["claude", "codex"]) {
    const manifest = JSON.parse(readFileSync(join(PLUGIN, "hooks", `${host}.json`), "utf8"));
    for (const name of ["SessionStart", "UserPromptSubmit", "PreCompact", "PostCompact", "PreToolUse", "PostToolUse", "Stop"]) {
      assert.ok(name in manifest.hooks, `${host}:${name}`);
    }
    const raw = JSON.stringify(manifest);
    assert.doesNotMatch(raw, /AI_EXPERTS_SESSION_ID|AI_EXPERTS_TRIGGER_FROM/u);
    if (host === "codex") assert.match(raw, /"additionalContextLimit":1200/u);
  }
});

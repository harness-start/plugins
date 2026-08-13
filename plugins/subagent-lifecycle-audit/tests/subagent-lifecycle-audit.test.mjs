import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = join(
  PLUGIN_ROOT,
  "scripts",
  "subagent-lifecycle-audit.mjs",
);
const REPORT = join(
  PLUGIN_ROOT,
  "scripts",
  "subagent-lifecycle-report.mjs",
);

function workspace({ preignore = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "subagent-lifecycle-audit-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  if (preignore) {
    writeFileSync(join(root, ".gitignore"), ".subagent-lifecycle-audit/\n");
  }
  return root;
}

function runEntryInput(mode, input, envOverrides = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: {
        ...process.env,
        AI_EXPERTS_SESSION_ID: "provenance-session",
        AI_EXPERTS_TRIGGER_FROM: `subagent-lifecycle-audit:${mode}`,
        PLUGIN_ROOT,
        ...envOverrides,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function runEntry(mode, event) {
  return runEntryInput(mode, JSON.stringify(event));
}

function runReport(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [REPORT, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

function readSessionRows(root, sessionKey) {
  const path = join(
    root,
    ".subagent-lifecycle-audit",
    "sessions",
    `${sessionKey}.jsonl`,
  );
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("records matched start and stop rows without subagent content", async () => {
  const root = workspace();
  try {
    const start = await runEntry("start", {
      hook_event_name: "SubagentStart",
      cwd: root,
      session_id: "session-1",
      agent_id: "agent-1",
      agent_type: "explorer",
      parent_agent_id: "parent-1",
      agent_prompt: "PRIVATE START CONTENT",
    });
    assert.equal(start.code, 0);

    const stop = await runEntry("stop", {
      hook_event_name: "SubagentStop",
      cwd: root,
      session_id: "session-1",
      agent_id: "agent-1",
      agent_type: "explorer",
      parent_agent_id: "parent-1",
      last_assistant_message: "PRIVATE STOP CONTENT",
    });
    assert.equal(stop.code, 0);

    const rows = readSessionRows(root, "session-1");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.event), ["started", "stopped"]);
    assert.equal(rows[0].correlation, "open");
    assert.equal(rows[1].correlation, "matched");
    assert.equal(rows[1].started_at, rows[0].started_at);
    assert.equal(typeof rows[1].duration_ms, "number");
    assert.ok(rows[1].duration_ms >= 0);
    assert.equal(rows[1].provenance.session_id, "provenance-session");
    assert.equal(rows[1].provenance.trigger_from, "subagent-lifecycle-audit:stop");

    const serialized = JSON.stringify(rows);
    assert.doesNotMatch(serialized, /PRIVATE START CONTENT/u);
    assert.doesNotMatch(serialized, /PRIVATE STOP CONTENT/u);
    assert.equal(dirname(ENTRY), join(PLUGIN_ROOT, "scripts"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("records Codex as the host when both plugin root variables are present", async () => {
  const root = workspace();
  try {
    const result = await runEntryInput("start", JSON.stringify({
      cwd: root,
      session_id: "session-dual-root",
      agent_id: "agent-dual-root",
    }), {
      CLAUDE_PLUGIN_ROOT: "/stale-claude-plugin-root",
    });
    assert.equal(result.code, 0);

    const [row] = readSessionRows(root, "session-dual-root");
    assert.equal(row.host, "codex");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies shell mutation of the lifecycle audit trail", async () => {
  const root = workspace();
  try {
    const result = await runEntry("protect", {
      hook_event_name: "PreToolUse",
      cwd: root,
      session_id: "session-protect",
      tool_name: "Bash",
      tool_input: {
        command: "/bin/rm -rf .subagent-lifecycle-audit/sessions",
      },
    });

    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.hookSpecificOutput.permissionDecision, "deny");
    assert.match(
      payload.hookSpecificOutput.permissionDecisionReason,
      /Subagent Lifecycle Audit/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies interpreter rewrite of the lifecycle audit trail", async () => {
  const root = workspace();
  try {
    const result = await runEntry("protect", {
      hook_event_name: "PreToolUse",
      cwd: root,
      session_id: "session-protect-py",
      tool_name: "Bash",
      tool_input: {
        command: "python3 -c \"open('.subagent-lifecycle-audit/sessions/s.jsonl','w').write('x')\"",
      },
    });
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports an unmatched start as open without claiming failure", async () => {
  const root = workspace();
  try {
    const start = await runEntry("start", {
      cwd: root,
      session_id: "session-report",
      agent_id: "agent-open",
      agent_type: "reviewer",
    });
    assert.equal(start.code, 0);

    const result = await runReport([
      "--cwd",
      root,
      "--session",
      "session-report",
      "--json",
    ]);
    assert.equal(result.code, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schema, "subagent-lifecycle-report/v1");
    assert.equal(report.sessions.length, 1);
    assert.equal(report.sessions[0].counts.open, 1);
    assert.equal(report.sessions[0].agents[0].state, "open");
    assert.equal("failed" in report.sessions[0].agents[0], false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("records missing agent identity as an explicit correlation state", async () => {
  const root = workspace();
  try {
    const result = await runEntry("start", {
      cwd: root,
      sessionId: "session-missing-id",
      agentType: "explorer",
    });
    assert.equal(result.code, 0);

    const [row] = readSessionRows(root, "session-missing-id");
    assert.equal(row.agent_id, null);
    assert.equal(row.correlation, "missing-agent-id");
    assert.equal(row.agent_type, "explorer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("records a stop without a matching start as orphan-stop", async () => {
  const root = workspace();
  try {
    const result = await runEntry("stop", {
      cwd: root,
      session_id: "session-orphan",
      agent_id: "agent-orphan",
    });
    assert.equal(result.code, 0);

    const [row] = readSessionRows(root, "session-orphan");
    assert.equal(row.event, "stopped");
    assert.equal(row.correlation, "orphan-stop");
    assert.equal(row.duration_ms, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("marks a second unmatched start for the same agent as duplicate", async () => {
  const root = workspace();
  try {
    const event = {
      cwd: root,
      session_id: "session-duplicate",
      agent_id: "agent-duplicate",
    };
    await runEntry("start", event);
    await runEntry("start", event);

    const rows = readSessionRows(root, "session-duplicate");
    assert.deepEqual(
      rows.map((row) => row.correlation),
      ["open", "duplicate-start"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("serializes concurrent start observations as valid JSONL rows", async () => {
  const root = workspace();
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) => runEntry("start", {
        cwd: root,
        session_id: "session-concurrent",
        agent_id: `agent-${index}`,
      })),
    );
    assert.equal(results.every((result) => result.code === 0), true);

    const rows = readSessionRows(root, "session-concurrent");
    assert.equal(rows.length, 6);
    assert.equal(new Set(rows.map((row) => row.agent_id)).size, 6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails open without creating an audit root for malformed stdin", async () => {
  const root = workspace();
  try {
    const result = await runEntryInput("start", "{invalid-json");
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(join(root, ".subagent-lifecycle-audit")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("records the first observation without modifying the project gitignore", async () => {
  const root = workspace({ preignore: false });
  try {
    writeFileSync(join(root, ".gitignore"), "vendor/\n", "utf8");
    const result = await runEntry("start", {
      cwd: root,
      session_id: "session-ignore",
      agent_id: "agent-ignore",
    });
    assert.equal(result.code, 0);

    assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "vendor/\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies direct file writes under the audit root and allows a near miss", async () => {
  const root = workspace();
  try {
    const denied = await runEntry("protect", {
      cwd: root,
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".subagent-lifecycle-audit", "sessions", "x.jsonl"),
      },
    });
    assert.equal(
      JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );

    const allowed = await runEntry("protect", {
      cwd: root,
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".subagent-lifecycle-audit-notes", "x.md"),
      },
    });
    assert.equal(allowed.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

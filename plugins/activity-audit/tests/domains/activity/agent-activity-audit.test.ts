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
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { main as agentActivityAuditMain } from "../../../src/domains/activity/entries/hooks/agent-activity-audit.js";

import {
  durationMs,
  inferCommandStatus,
  redactCommand,
} from "../../../src/domains/activity/lib/command-policy.js";

test("agent activity Hook remains an import-safe owner handler", () => {
  assert.equal(typeof agentActivityAuditMain, "function");
});
import { resolveConfig } from "../../../src/domains/activity/lib/config.js";
import {
  appendRecord,
  findPendingByToolUseId,
  rewriteTip,
} from "../../../src/domains/activity/lib/jsonl-trail.js";
import {
  commandMentionsAuditRoot,
  isAuditMutationCommand,
  shellMutatesAuditRoot,
} from "../../../src/domains/activity/lib/protect.js";
import { sameToolUseId } from "../../../src/domains/activity/lib/command-policy.js";

const ENTRY = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));

function workspace(prefix = "agent-activity-audit-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function runEntry(mode, event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "codex", ({ "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop", session: "SessionStart", prompt: "UserPromptSubmit", "user-prompt": "UserPromptSubmit", subagent: "SubagentStart", "subagent-stop": "SubagentStop" } as Record<string, string>)[mode] ?? mode], {
      env: { ...process.env },
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

function readSessionLines(root, sessionId) {
  const path = join(root, ".agent-activity-audit", "sessions", `${sessionId}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("resolveConfig rejects reserved and absolute auditRoot", () => {
  const warnings = [];
  assert.equal(resolveConfig({ auditRoot: "logs" }, (m) => warnings.push(m)).auditRoot, ".agent-activity-audit");
  assert.equal(resolveConfig({ auditRoot: "/tmp/x" }, (m) => warnings.push(m)).auditRoot, ".agent-activity-audit");
  assert.equal(resolveConfig({ maxCommandChars: 10 }, (m) => warnings.push(m)).maxCommandChars, 2000);
  assert.ok(warnings.length >= 2);
});

test("resolveConfig never permits command secret redaction to be disabled", () => {
  const warnings = [];
  const config = resolveConfig({ redactSecrets: false }, (message) => warnings.push(message));

  assert.equal(config.redactSecrets, true);
  assert.match(warnings.join("\n"), /cannot be disabled/iu);
});

test("sameToolUseId requires non-empty ids", () => {
  assert.equal(sameToolUseId("a", "a"), true);
  assert.equal(sameToolUseId("", ""), false);
  assert.equal(sameToolUseId(null, null), false);
  assert.equal(sameToolUseId("a", null), false);
});

test("redactCommand strips secrets and truncates", () => {
  const redacted = redactCommand("export API_TOKEN=supersecret MYSQL_PWD=dbpass npm test", {
    maxCommandChars: 2000,
    redactSecrets: true,
  });
  assert.match(redacted, /API_TOKEN=\*\*\*/u);
  assert.match(redacted, /MYSQL_PWD=\*\*\*/u);
  assert.doesNotMatch(redacted, /supersecret|dbpass/u);

  const short = redactCommand("TOKEN=secret " + "x".repeat(100), {
    maxCommandChars: 20,
    redactSecrets: false,
  });
  assert.equal(short.length, 21);
  assert.ok(short.endsWith("…"));
  assert.doesNotMatch(short, /secret/u);
});

test("inferCommandStatus defaults to unknown without explicit signal", () => {
  assert.equal(inferCommandStatus({ tool_response: "ok\nExit code: 0\n" }).status, "success");
  assert.equal(inferCommandStatus({ tool_response: { exit_code: 2 } }).status, "failure");
  assert.equal(inferCommandStatus({}, true).status, "failure");
  assert.equal(inferCommandStatus({ tool_response: "all good with no exit line" }).status, "unknown");
  assert.equal(inferCommandStatus({}).status, "unknown");
  assert.equal(inferCommandStatus({ tool_response: { success: true } }).status, "success");
});

test("durationMs is non-negative", () => {
  assert.equal(durationMs("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.500Z"), 1500);
  assert.equal(durationMs("2026-01-01T00:00:01.500Z", "2026-01-01T00:00:00.000Z"), 0);
});

test("shell protect path boundaries and mutators", () => {
  const rel = ".agent-activity-audit";
  const abs = "/tmp/proj/.agent-activity-audit";
  assert.equal(commandMentionsAuditRoot("node scripts/build.js --out logs", rel, abs), false);
  assert.equal(shellMutatesAuditRoot("node scripts/build.js --out logs", rel, abs), false);
  assert.equal(shellMutatesAuditRoot("cat .agent-activity-audit/sessions/x.jsonl", rel, abs), false);
  assert.equal(shellMutatesAuditRoot("rm -rf .agent-activity-audit/sessions", rel, abs), true);
  assert.equal(shellMutatesAuditRoot("/bin/rm -rf .agent-activity-audit", rel, abs), true);
  assert.equal(isAuditMutationCommand("find .agent-activity-audit -delete"), true);
  assert.equal(shellMutatesAuditRoot("find .agent-activity-audit -type f -delete", rel, abs), true);
  assert.equal(
    shellMutatesAuditRoot(
      "python3 -c \"open('.agent-activity-audit/sessions/s.jsonl','w').write('forged\\n')\"",
      rel,
      abs,
    ),
    true,
  );
  assert.equal(
    shellMutatesAuditRoot(
      "node -e \"require('fs').writeFileSync('.agent-activity-audit/sessions/s.jsonl','x')\"",
      rel,
      abs,
    ),
    true,
  );
});

test("pre denies interpreter rewrite of the audit trail", async () => {
  const root = workspace();
  try {
    const deny = await runEntry("pre", {
      cwd: root,
      session_id: "sess-py",
      tool_name: "Bash",
      tool_input: {
        command: "python3 -c \"open('.agent-activity-audit/sessions/s.jsonl','w').write('forged\\n')\"",
      },
    });
    assert.equal(JSON.parse(deny.stdout.trim()).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre and post create a local gitignore without modifying the project gitignore", async () => {
  const root = workspace();
  try {
    writeFileSync(join(root, ".gitignore"), "vendor/\n", "utf8");
    await runEntry("pre", {
      cwd: root,
      session_id: "sess-1",
      tool_name: "Bash",
      tool_use_id: "tu-1",
      tool_input: { command: "npm test" },
    });
    let lines = readSessionLines(root, "sess-1");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].status, "pending");

    await runEntry("post", {
      cwd: root,
      session_id: "sess-1",
      tool_name: "Bash",
      tool_use_id: "tu-1",
      tool_input: { command: "npm test" },
      tool_response: "all good\nExit code: 0\n",
    });
    lines = readSessionLines(root, "sess-1");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].status, "success");
    assert.equal(typeof lines[0].duration_ms, "number");
    assert.ok(lines[0].duration_ms >= 0);
    assert.equal(lines[0].exit_code, 0);
    assert.equal("stdout" in lines[0], false);
    assert.equal("stderr" in lines[0], false);

    assert.equal(readFileSync(join(root, ".agent-activity-audit", ".gitignore"), "utf8"), "*\n");
    assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "vendor/\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel finish recovers duration from non-tip pending", async () => {
  const root = workspace();
  try {
    await runEntry("pre", {
      cwd: root,
      session_id: "sess-2",
      tool_name: "Bash",
      tool_use_id: "tu-a",
      tool_input: { command: "echo a" },
    });
    // ensure started_at is strictly earlier
    await new Promise((r) => setTimeout(r, 20));
    await runEntry("pre", {
      cwd: root,
      session_id: "sess-2",
      tool_name: "Bash",
      tool_use_id: "tu-b",
      tool_input: { command: "echo b" },
    });
    await runEntry("post", {
      cwd: root,
      session_id: "sess-2",
      tool_name: "Bash",
      tool_use_id: "tu-a",
      tool_input: { command: "echo a" },
      tool_response: { exit_code: 0 },
    });
    const lines = readSessionLines(root, "sess-2");
    assert.equal(lines.length, 3);
    assert.equal(lines[0].status, "pending");
    assert.equal(lines[0].tool_use_id, "tu-a");
    assert.equal(lines[1].status, "pending");
    assert.equal(lines[1].tool_use_id, "tu-b");
    assert.equal(lines[2].status, "success");
    assert.equal(lines[2].tool_use_id, "tu-a");
    assert.equal(lines[2].started_at, lines[0].started_at);
    assert.ok(lines[2].duration_ms >= 20);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty tool_use_id never rewrites tip of another pending", async () => {
  const root = workspace();
  try {
    await runEntry("pre", {
      cwd: root,
      session_id: "sess-e",
      tool_name: "Bash",
      tool_use_id: "tu-kept",
      tool_input: { command: "echo kept" },
    });
    await runEntry("pre", {
      cwd: root,
      session_id: "sess-e",
      tool_name: "Bash",
      tool_input: { command: "echo empty-id" },
    });
    await runEntry("post", {
      cwd: root,
      session_id: "sess-e",
      tool_name: "Bash",
      tool_input: { command: "echo empty-id" },
      tool_response: { exit_code: 0 },
    });
    const lines = readSessionLines(root, "sess-e");
    assert.equal(lines[0].status, "pending");
    assert.equal(lines[0].tool_use_id, "tu-kept");
    assert.equal(lines[1].status, "pending");
    assert.ok(lines[1].tool_use_id == null || lines[1].tool_use_id === "");
    assert.equal(lines[2].status, "success");
    assert.equal(lines.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre denies /bin/rm of audit trail and allows unrelated node", async () => {
  const root = workspace();
  try {
    const deny = await runEntry("pre", {
      cwd: root,
      session_id: "sess",
      tool_name: "Bash",
      tool_input: { command: "/bin/rm -rf .agent-activity-audit/sessions" },
    });
    assert.equal(JSON.parse(deny.stdout.trim()).hookSpecificOutput.permissionDecision, "deny");

    const allow = await runEntry("pre", {
      cwd: root,
      session_id: "sess",
      tool_name: "Bash",
      tool_use_id: "tu-node",
      tool_input: { command: "node scripts/build.js --out logs" },
    });
    assert.equal(allow.stdout.trim(), "");
    assert.equal(readSessionLines(root, "sess").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failure mode marks status failure", async () => {
  const root = workspace();
  try {
    await runEntry("pre", {
      cwd: root,
      session_id: "sess-f",
      tool_name: "Bash",
      tool_use_id: "tu-f",
      tool_input: { command: "false" },
    });
    await runEntry("failure", {
      cwd: root,
      session_id: "sess-f",
      tool_name: "Bash",
      tool_use_id: "tu-f",
      tool_input: { command: "false" },
      tool_response: "boom",
    });
    const lines = readSessionLines(root, "sess-f");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].status, "failure");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findPendingByToolUseId and rewriteTip miss on non-matching tip", () => {
  const root = mkdtempSync(join(tmpdir(), "cmd-trail-"));
  const path = join(root, "s.jsonl");
  appendRecord(path, { schema: "agent-activity/v1", kind: "command", status: "pending", tool_use_id: "a", started_at: "t0" });
  appendRecord(path, { schema: "agent-activity/v1", kind: "command", status: "pending", tool_use_id: "b", started_at: "t1" });
  assert.equal(findPendingByToolUseId(path, "a").started_at, "t0");
  const result = rewriteTip(
    path,
    (parsed) => parsed.tool_use_id === "a",
    { status: "success", tool_use_id: "a" },
  );
  assert.equal(result, "miss");
  rmSync(root, { recursive: true, force: true });
});

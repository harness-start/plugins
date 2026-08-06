import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildSubagentStartContext,
  HYGIENE_CONTEXT,
  MAX_CONTEXT_CHARS,
  SUBAGENT_CONTEXT,
} from "../scripts/lib/policy.mjs";
import { ledgerRoot } from "../scripts/lib/ledger.mjs";

const START = fileURLToPath(
  new URL("../scripts/subagent-discipline-hook-start.mjs", import.meta.url),
);
const STOP = fileURLToPath(
  new URL("../scripts/subagent-discipline-hook-stop.mjs", import.meta.url),
);

function runEntry(entry, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
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

function tempGitRepo() {
  const root = mkdtempSync(join(tmpdir(), "sd-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function writeConfig(root, conf) {
  writeFileSync(
    join(root, ".subagent-discipline.mjs"),
    `export default ${JSON.stringify(conf)};\n`,
    "utf8",
  );
}

test("policy includes hygiene marker and stays under limit", () => {
  const ctx = buildSubagentStartContext();
  assert.match(ctx, /\[Subagent Contract\]/);
  assert.match(ctx, /\[Return Hygiene\]/);
  assert.ok(ctx.length <= MAX_CONTEXT_CHARS);
  assert.ok(SUBAGENT_CONTEXT.length > 0);
  assert.ok(HYGIENE_CONTEXT.length > 0);
});

test("policy does not impose Result Card", () => {
  assert.doesNotMatch(
    buildSubagentStartContext(),
    /Result Card|Parent action needed:/u,
  );
});

test("Start without agentId injects context but creates no ledger", async () => {
  const root = tempGitRepo();
  const result = await runEntry(
    START,
    JSON.stringify({
      hook_event_name: "SubagentStart",
      cwd: root,
      agent_type: "Explore",
    }),
  );
  assert.equal(result.code, 0);
  const out = JSON.parse(result.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /\[Return Hygiene\]/);
  assert.equal(existsSync(ledgerRoot(root)), false);
  assert.equal(existsSync(join(root, ".gitignore")), false);
});

test("Start with agentId writes spawn ledger and gitignore", async () => {
  const root = tempGitRepo();
  const result = await runEntry(
    START,
    JSON.stringify({
      hook_event_name: "SubagentStart",
      cwd: root,
      agent_id: "agent-test-1",
      agent_type: "Explore",
      agent_prompt: "explore the auth module",
      session_id: "sess-1",
    }),
  );
  assert.equal(result.code, 0);
  assert.ok(existsSync(join(ledgerRoot(root), "spawns", "agent-test-1.json")));
  assert.match(
    readFileSync(join(root, ".gitignore"), "utf8"),
    /\.subagent-discipline\//,
  );
});

test("Stop without agentId is no-op", async () => {
  const root = tempGitRepo();
  const result = await runEntry(
    STOP,
    JSON.stringify({
      hook_event_name: "SubagentStop",
      cwd: root,
      last_assistant_message: "done",
    }),
  );
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "");
  assert.equal(existsSync(ledgerRoot(root)), false);
});

test("Stop soft mode with hardFail does not block but writes return", async () => {
  const root = tempGitRepo();
  await runEntry(
    START,
    JSON.stringify({
      hook_event_name: "SubagentStart",
      cwd: root,
      agent_id: "agent-soft-1",
      agent_type: "Explore",
    }),
  );
  const result = await runEntry(
    STOP,
    JSON.stringify({
      hook_event_name: "SubagentStop",
      cwd: root,
      agent_id: "agent-soft-1",
      last_assistant_message: "ok",
    }),
  );
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "");
  const returns = readdirSync(join(ledgerRoot(root), "returns"));
  assert.ok(returns.some((n) => n.startsWith("agent-soft-1-")));
});

test("Stop block mode emits decision block on empty return", async () => {
  const root = tempGitRepo();
  writeConfig(root, { evidence: { mode: "block", maxAttempts: 2 } });
  await runEntry(
    START,
    JSON.stringify({
      hook_event_name: "SubagentStart",
      cwd: root,
      agent_id: "agent-block-1",
      agent_type: "Explore",
    }),
  );
  const result = await runEntry(
    STOP,
    JSON.stringify({
      hook_event_name: "SubagentStop",
      cwd: root,
      agent_id: "agent-block-1",
      last_assistant_message: "ok",
    }),
  );
  assert.equal(result.code, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.decision, "block");
  assert.match(out.reason, /Subagent Hygiene/);
});

test("Stop block respects stop_hook_active", async () => {
  const root = tempGitRepo();
  writeConfig(root, { evidence: { mode: "block" } });
  const result = await runEntry(
    STOP,
    JSON.stringify({
      hook_event_name: "SubagentStop",
      cwd: root,
      agent_id: "agent-block-2",
      stop_hook_active: true,
      last_assistant_message: "ok",
    }),
  );
  assert.equal(result.stdout.trim(), "");
});

test("Start fails open for malformed JSON", async () => {
  const result = await runEntry(START, "{");
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
});

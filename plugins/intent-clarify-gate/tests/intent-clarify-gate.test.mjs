import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, resolveConfig } from "../scripts/lib/config.mjs";
import {
  actionablePrompt,
  applyClassification,
  classifyUserInput,
  isExpired,
  isLedgerPath,
  isProtectedStatePath,
  matchEntry,
  openFromEntry,
  parseCompleteOptions,
  pathMatchesGlob,
  shellLooksMutating,
  writeBlockActive,
} from "../scripts/lib/policy.mjs";
import { emptyState } from "../scripts/lib/state-store.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/intent-clarify-gate.mjs", import.meta.url));

function workspace(prefix = "intent-clarify-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs", "decisions"), { recursive: true });
  writeFileSync(join(root, "src", "app.js"), "export const value = 0;\n");
  return root;
}

function runEntry(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(typeof event === "string" ? event : JSON.stringify(event));
  });
}

function parseStdout(stdout) {
  const line = String(stdout).trim();
  if (!line) return null;
  try {
    return JSON.parse(line.split("\n").filter(Boolean).at(-1));
  } catch {
    return null;
  }
}

test("matchEntry requires prefix tokens only", () => {
  assert.deepEqual(matchEntry("/grill-me dashboard"), {
    token: "/grill-me",
    topic: "dashboard",
  });
  assert.deepEqual(matchEntry("$grill-me: auth"), {
    token: "$grill-me",
    topic: "auth",
  });
  assert.equal(matchEntry("Implement login and use /grill-me later"), null);
  assert.equal(matchEntry("please /grilling later"), null);
  assert.ok(matchEntry("/grilling"));
});

test("actionablePrompt strips skill and fence noise before entry match", () => {
  const prompt = "<skill>x</skill>\n\n/grill-me topic";
  assert.equal(matchEntry(prompt)?.topic, "topic");
  assert.ok(actionablePrompt("```\n/grill-me\n```\nok").includes("ok"));
});

test("classify matrix: choice, choice_note, constraint, done, abort", () => {
  const open = { completeOffered: false, completeChoice: null };
  assert.equal(classifyUserInput("2", open).class, "choice");
  assert.equal(classifyUserInput("2", open).choice, "2");

  const note = classifyUserInput("1 but change the feedback window to 3 days", open);
  assert.equal(note.class, "choice_note");
  assert.equal(note.choice, "1");
  assert.match(note.note, /feedback window/);

  const colon = classifyUserInput("3: use JWT", open);
  assert.equal(colon.class, "choice_note");
  assert.equal(colon.choice, "3");

  assert.equal(classifyUserInput("We already have an outbox", open).class, "constraint");
  assert.equal(classifyUserInput("How is completion measured?", open).class, "constraint");

  assert.equal(classifyUserInput("done", open).class, "done");
  assert.equal(classifyUserInput("done put the ledger under docs", open).class, "done");

  assert.equal(classifyUserInput("# grill-abort", open).class, "abort");
  assert.equal(classifyUserInput("Okay, start writing", open).class, "constraint");
});

test("complete option parse and selecting N closes", () => {
  const text = [
    "**Q: What next?**",
    "1. Confirm the feature flag",
    "2. Confirm the TTL",
    "3. Done — lock the selected decisions",
  ].join("\n");
  const parsed = parseCompleteOptions(text);
  assert.equal(parsed.completeOffered, true);
  assert.equal(parsed.completeChoice, "3");

  const done = classifyUserInput("3", {
    completeOffered: true,
    completeChoice: "3",
  });
  assert.equal(done.class, "done");
  assert.equal(done.via, "choice");

  const stillChoice = classifyUserInput("1", {
    completeOffered: true,
    completeChoice: "3",
  });
  assert.equal(stillChoice.class, "choice");
});

test("fullwidth digits normalize for choice", () => {
  assert.equal(classifyUserInput("２", {}).class, "choice");
  assert.equal(classifyUserInput("２", {}).choice, "2");
});

test("ledger path allowlist and write-block phase gate", () => {
  const config = resolveConfig(null);
  assert.equal(isLedgerPath("docs/decisions/x.md", config), true);
  assert.equal(isLedgerPath(".grill-ledgers/a.md", config), true);
  assert.equal(isLedgerPath("spec.md", config), true);
  assert.equal(isLedgerPath("src/app.js", config), false);
  assert.equal(isProtectedStatePath(".grill-ledgers/.state/abc.json"), true);
  assert.equal(isLedgerPath(".grill-ledgers/.state/abc.json", config), false);
  assert.equal(pathMatchesGlob("docs/decisions/a.md", "docs/decisions/**"), true);
  assert.equal(writeBlockActive("open", config), true);
  assert.equal(writeBlockActive("closed", config), false);
  assert.equal(writeBlockActive("idle", config), false);
});

test("state transitions: entry → choice → done", () => {
  let state = emptyState();
  state = openFromEntry(state, { token: "/grill-me", topic: "x" }, 1000);
  assert.equal(state.phase, "open");
  state = applyClassification(
    state,
    classifyUserInput("1 with a note", state),
    2000,
  );
  assert.equal(state.phase, "open");
  assert.equal(state.lastUserClass, "choice_note");
  state = applyClassification(state, classifyUserInput("done", state), 3000);
  assert.equal(state.phase, "closed");
  assert.equal(state.closeReason, "completed");
});

test("TTL expiry detection", () => {
  const state = {
    phase: "open",
    updatedAt: Date.now() - 48 * 3600_000,
  };
  assert.equal(isExpired(state, 24), true);
  assert.equal(isExpired({ phase: "open", updatedAt: Date.now() }, 24), false);
});

test("shell mutating heuristic", () => {
  assert.equal(shellLooksMutating("cat > src/a.js <<'EOF'\nx\nEOF"), true);
  assert.equal(shellLooksMutating("git status"), false);
  assert.equal(shellLooksMutating("rm -rf src"), true);
  assert.equal(shellLooksMutating("node -e \"require('fs').writeFileSync('src/app.js','x')\""), true);
  assert.equal(shellLooksMutating("python3 -c \"open('src/app.js','w').write('x')\""), true);
});

test("config rejects invalid writeBlock mode", () => {
  const warnings = [];
  const config = resolveConfig({ writeBlock: { mode: "nope" } }, (m) => warnings.push(m));
  assert.equal(config.writeBlock.mode, DEFAULT_CONFIG.writeBlock.mode);
  assert.ok(warnings.length >= 1);
});

test("hook integration: open denies business write, allows ledger, done unlocks", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-integration-1";

  try {
    const entry = await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me dashboard" },
      env,
    );
    assert.equal(entry.code, 0);
    const entryOut = parseStdout(entry.stdout);
    assert.ok(entryOut?.hookSpecificOutput?.additionalContext?.includes("intent-clarify-gate"));

    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "export const value = 1;\n",
        },
      },
      env,
    );
    assert.equal(deny.code, 0);
    const denyOut = parseStdout(deny.stdout);
    assert.equal(
      denyOut?.hookSpecificOutput?.permissionDecision,
      "deny",
      deny.stdout || deny.stderr,
    );
    assert.match(
      denyOut.hookSpecificOutput.permissionDecisionReason,
      /intent-clarify-gate/,
    );

    const allowLedger = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "docs", "decisions", "grill.md"),
          content: "# ok\n",
        },
      },
      env,
    );
    assert.equal(allowLedger.code, 0);
    assert.equal(parseStdout(allowLedger.stdout), null);

    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "1. a\n2. b\n3. Done — lock scope\n",
      },
      env,
    );
    assert.equal(stop.code, 0);

    const chooseComplete = await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "3" },
      env,
    );
    assert.equal(chooseComplete.code, 0);
    const closedCtx = parseStdout(chooseComplete.stdout);
    assert.match(
      closedCtx?.hookSpecificOutput?.additionalContext ?? "",
      /interview is closed|write barrier is released/iu,
    );

    const allowWrite = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "export const value = 2;\n",
        },
      },
      env,
    );
    assert.equal(allowWrite.code, 0);
    assert.equal(
      parseStdout(allowWrite.stdout),
      null,
      "closed phase must not deny business writes",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook integration: open denies interpreter writes of business files", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-node-e";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me dashboard" },
      env,
    );
    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: {
          command: "node -e \"require('fs').writeFileSync('src/app.js','x')\"",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(deny.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      deny.stdout || deny.stderr,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook integration: bare done without a decision artifact keeps the write barrier", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-done-meta";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me x" },
      env,
    );
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "done" },
      env,
    );
    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Edit",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          old_string: "0",
          new_string: "9",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(deny.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      deny.stdout || deny.stderr,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("mid-string grill-me does not open write-block", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  try {
    await runEntry(
      "prompt",
      {
        cwd: root,
        session_id: "s-mid",
        prompt: "Implement login and use /grill-me later",
      },
      env,
    );
    const pre = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: "s-mid",
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "x\n",
        },
      },
      env,
    );
    assert.equal(parseStdout(pre.stdout), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("corrupt state file fails open (no permanent write lock)", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-corrupt";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me x" },
      env,
    );
    const pluginDir = join(root, ".grill-ledgers", ".state");
    for (const name of readdirSync(pluginDir).filter((item) => item.endsWith(".json"))) {
      writeFileSync(join(pluginDir, name), "{not-json", "utf8");
    }
    const pre = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "ok\n",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(pre.stdout),
      null,
      "corrupt state must fail-open and not deny writes",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("stop blocks implement claim while open", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-impl";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me x" },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "Okay, I am going to implement the login module.",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(out?.decision, "block");
    assert.match(out?.reason ?? "", /interview is still open/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("abort unlocks writes", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "icg-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-abort";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me x" },
      env,
    );
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "# grill-abort" },
      env,
    );
    const pre = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "y\n",
        },
      },
      env,
    );
    assert.equal(parseStdout(pre.stdout), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: nested cwd keeps state in that workspace, not the parent git root", async () => {
  const parent = workspace("icg-parent-git-");
  const nested = join(parent, "pkg");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, "app.js"), "export const value = 0;\n");
  try {
    await runEntry(
      "prompt",
      { cwd: nested, session_id: "sess-nested-cwd", prompt: "/grill-me nest" },
      { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" },
    );
    assert.equal(existsSync(join(nested, ".grill-ledgers", ".state")), true);
    assert.equal(
      existsSync(join(parent, ".grill-ledgers")),
      false,
      "must not write session state to the parent git root",
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("hook: session state lives under the project, not PLUGIN_DATA", async () => {
  const root = workspace("icg-project-state-");
  const data = mkdtempSync(join(tmpdir(), "icg-data-unused-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-project-state";
  try {
    const entry = await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me cache" },
      env,
    );
    assert.equal(entry.code, 0, entry.stderr);

    const stateDir = join(root, ".grill-ledgers", ".state");
    assert.equal(existsSync(stateDir), true, "expected project .grill-ledgers/.state");
    const files = readdirSync(stateDir).filter((name) => name.endsWith(".json"));
    assert.equal(files.length, 1, `expected one state file, got ${files.join(",")}`);
    const saved = JSON.parse(readFileSync(join(stateDir, files[0]), "utf8"));
    assert.equal(saved.phase, "open");
    assert.equal(
      existsSync(join(data, "intent-clarify-gate")),
      false,
      "must not write host PLUGIN_DATA/intent-clarify-gate",
    );

    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: { file_path: join(root, "src", "app.js"), content: "x\n" },
      },
      { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" },
    );
    assert.equal(
      parseStdout(deny.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      "open phase must persist without PLUGIN_DATA",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: idle prompt does not create project state files", async () => {
  const root = workspace("icg-idle-state-");
  try {
    const idle = await runEntry(
      "prompt",
      { cwd: root, session_id: "sess-idle", prompt: "ordinary request" },
      { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" },
    );
    assert.equal(idle.code, 0, idle.stderr);
    assert.equal(parseStdout(idle.stdout), null);
    assert.equal(existsSync(join(root, ".grill-ledgers")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hook: agent cannot rewrite project session state", async () => {
  const root = workspace("icg-protect-state-");
  const session = "sess-protect-state";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/grill-me cache" },
      { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" },
    );
    const denyWrite = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, ".grill-ledgers", ".state", "forged.json"),
          content: "{\"phase\":\"idle\"}\n",
        },
      },
      { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" },
    );
    assert.equal(
      parseStdout(denyWrite.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      denyWrite.stdout || denyWrite.stderr,
    );
    const denyRm = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: { command: "rm -rf .grill-ledgers/.state" },
      },
      { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" },
    );
    assert.equal(
      parseStdout(denyRm.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      denyRm.stdout || denyRm.stderr,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

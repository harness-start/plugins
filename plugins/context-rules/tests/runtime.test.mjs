import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contextRuleContext, promptContext, sessionContext, stopContext } from "../scripts/runtime.mjs";

function fixture(prefix) { return mkdtempSync(join(tmpdir(), prefix)); }
function withEnv(name, value) { const previous = process.env[name]; process.env[name] = value; return () => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }; }

test("session context reports git state without reading instruction content", async () => {
  const root = fixture("context-session-"); const state = fixture("context-state-"); const restore = withEnv("PLUGIN_DATA", state);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, "AGENTS.md"), "secret instruction body\n");
    const output = await sessionContext({ cwd: root, session_id: "session" });
    assert.match(output, /\[Session Context\]/u);
    assert.match(output, /AGENTS\.md/u);
    assert.doesNotMatch(output, /secret instruction body/u);
  } finally { restore(); rmSync(root, { recursive: true, force: true }); rmSync(state, { recursive: true, force: true }); }
});

test("Codex pre-tool context points to matching installed rules only", async () => {
  const root = fixture("context-work-"); const home = fixture("context-home-"); const state = fixture("context-state-");
  mkdirSync(join(home, "context-rules"));
  writeFileSync(join(home, "context-rules", "index.md"), "# Context Rule Index\n\n- [javascript-coding-contract](javascript-coding-contract.md): `**/*.mjs`\n");
  writeFileSync(join(home, "context-rules", "javascript-coding-contract.md"), "---\ndescription: \"JavaScript source contract.\"\n---\n# JavaScript Coding Contract\n");
  const restoreHome = withEnv("CODEX_HOME", home); const restoreState = withEnv("PLUGIN_DATA", state);
  try {
    const output = await contextRuleContext({ cwd: root, session_id: "rules", tool_input: { file_path: "scripts/run.mjs" } });
    assert.match(output, /javascript-coding-contract/u);
    assert.match(output, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  } finally { restoreHome(); restoreState(); rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); rmSync(state, { recursive: true, force: true }); }
});

test("prompt guidance consolidates correction and long-task signals", async () => {
  const root = fixture("context-prompt-"); const state = fixture("context-state-"); const restore = withEnv("PLUGIN_DATA", state);
  try {
    const output = await promptContext({ cwd: root, session_id: "prompt", prompt: "不要这样，把这 40 个接口逐个迁移并验证" });
    assert.match(output, /Feedback Reflection/u);
    assert.match(output, /long-task-context-primer/u);
    assert.match(output, /Skill Routing/u);
  } finally { restore(); rmSync(root, { recursive: true, force: true }); rmSync(state, { recursive: true, force: true }); }
});

test("question-only nontechnical prompt does not inject guidance", async () => {
  const state = fixture("context-state-"); const restore = withEnv("PLUGIN_DATA", state);
  try { assert.equal(await promptContext({ prompt: "今天星期几？" }), null); }
  finally { restore(); rmSync(state, { recursive: true, force: true }); }
});

test("stop audit recommends read-only feedback after a missing route", async () => {
  const state = fixture("context-state-"); const restore = withEnv("PLUGIN_DATA", state);
  try { assert.match(await stopContext({ session_id: "stop", prompt: "实现这个接口迁移" }), /session-runtime-feedback/u); }
  finally { restore(); rmSync(state, { recursive: true, force: true }); }
});

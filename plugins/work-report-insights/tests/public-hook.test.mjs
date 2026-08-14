import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readState, statePath } from "../scripts/lib/hook-state.mjs";
import { saveReport } from "../scripts/lib/report-store.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/work-report-insights-hook.mjs", import.meta.url));
const SAVE = fileURLToPath(new URL("../scripts/daily-work-report-save.mjs", import.meta.url));
const PREPARE = fileURLToPath(new URL("../scripts/daily-work-report-prepare.mjs", import.meta.url));
const ADDITION_PREPARE = fileURLToPath(new URL("../scripts/work-report-insights-addition-prepare.mjs", import.meta.url));
const APPEND = fileURLToPath(new URL("../scripts/work-report-insights-append.mjs", import.meta.url));

function runHook(mode, event, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
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

test("prompt mode is a no-op and does not route report language", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  try {
    const ordinary = await runHook("prompt", { cwd: home, session_id: "ordinary", prompt: "修复测试" }, env);
    assert.equal(ordinary.stdout, "");
    assert.equal(ordinary.stderr, "");

    const daily = await runHook("prompt", { cwd: home, session_id: "daily", prompt: "写今天的日报" }, env);
    assert.equal(daily.stdout, "");
    assert.equal(daily.stderr, "");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("save is allowed after prepare binds the same bytes", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  const input = join(home, "draft.md");
  const session = "prepare-flow";
  writeFileSync(input, "# 工作日报\n");
  const base = { cwd: home, session_id: session };
  const prepareCommand = `node ${PREPARE} --date 2026-08-10 --input ${input}`;
  const saveCommand = `node ${SAVE} --date 2026-08-10 --input ${input}`;
  try {
    const beforePrepare = await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: saveCommand } }, env);
    assert.equal(output(beforePrepare)?.hookSpecificOutput?.permissionDecision, "deny");

    const prepared = await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: prepareCommand } }, env);
    assert.equal(output(prepared)?.hookSpecificOutput?.permissionDecision ?? null, null);
    assert.equal((await readState(base, env)).phase, "prepared");

    const allowed = await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: saveCommand } }, env);
    assert.equal(output(allowed), null);

    writeFileSync(input, "# 被替换的日报\n");
    const changed = await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: saveCommand } }, env);
    assert.equal(output(changed)?.hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Stop is idle until prepare and then blocks a premature saved-report claim", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  const draft = join(home, "draft.md");
  const base = { cwd: home, session_id: "stop-flow" };
  writeFileSync(draft, "# 周报\n");
  try {
    const idle = await runHook("stop", { ...base, last_assistant_message: "周报已生成并保存。" }, env);
    assert.equal(output(idle), null);
    await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: `node ${PREPARE} --date 2026-08-10 --input ${draft}` } }, env);
    const waiting = await runHook("stop", { ...base, last_assistant_message: "本周最需要复盘的是哪件事？" }, env);
    assert.equal(output(waiting), null);
    const claim = await runHook("stop", { ...base, last_assistant_message: "周报已生成并保存。" }, env);
    assert.equal(output(claim)?.decision, "block");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("addition prepare binds both the new content and every existing report byte", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  const draft = join(home, "draft.md");
  const addition = join(home, "addition.md");
  const session = "append-flow";
  const base = { cwd: home, session_id: session };
  writeFileSync(draft, "# 工作日报\n");
  writeFileSync(addition, "补充内容\n");
  try {
    const saved = await saveReport({ kind: "daily", date: "2026-08-10", input: draft, home });
    const prepare = `node ${ADDITION_PREPARE} --report ${saved.path} --input ${addition}`;
    const append = `node ${APPEND} --report ${saved.path} --input ${addition}`;
    await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: prepare } }, env);
    assert.equal(output(await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: append } }, env)), null);

    writeFileSync(saved.path, `${readFileSync(saved.path, "utf8")}外部变化\n`);
    const changed = await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: append } }, env);
    assert.equal(output(changed)?.hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("post hook does not forge an append receipt when the report bytes did not change", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  const draft = join(home, "draft.md");
  const addition = join(home, "addition.md");
  const base = { cwd: home, session_id: "append-receipt-flow" };
  writeFileSync(draft, "# 工作日报\n");
  writeFileSync(addition, "补充内容\n");
  try {
    const saved = await saveReport({ kind: "daily", date: "2026-08-10", input: draft, home });
    const prepare = `node ${ADDITION_PREPARE} --report ${saved.path} --input ${addition}`;
    const append = `node ${APPEND} --report ${saved.path} --input ${addition}`;
    await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: prepare } }, env);

    const post = await runHook("post", { ...base, tool_name: "exec_command", tool_input: { cmd: append }, tool_response: { exit_code: 0 } }, env);
    assert.equal(output(post), null);
    assert.equal((await readState(base, env)).phase, "prepared");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("post hook does not forge a save receipt after an explicit tool failure", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  const draft = join(home, "draft.md");
  const base = { cwd: home, session_id: "save-failure-flow" };
  writeFileSync(draft, "# 工作日报\n");
  const prepare = `node ${PREPARE} --date 2026-08-10 --input ${draft}`;
  const save = `node ${SAVE} --date 2026-08-10 --input ${draft}`;
  try {
    await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: prepare } }, env);
    await saveReport({ kind: "daily", date: "2026-08-10", input: draft, home });

    const post = await runHook("post", { ...base, tool_name: "exec_command", tool_input: { cmd: save }, tool_response: { isError: true, exit_code: 2 } }, env);
    assert.equal(output(post), null);
    assert.equal((await readState(base, env)).phase, "prepared");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("hook state stores candidate digest and never the draft body", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  const event = { cwd: home, session_id: "privacy-flow" };
  const secret = "仅限本次测试的机密词";
  const draft = join(home, "draft.md");
  writeFileSync(draft, `# 工作日报\n\n${secret}\n`);
  try {
    await runHook("pre", {
      ...event,
      tool_name: "exec_command",
      tool_input: { cmd: `node ${PREPARE} --date 2026-08-10 --input ${draft}` },
    }, env);
    const stored = readFileSync(statePath(event, env), "utf8");
    assert.doesNotMatch(stored, /仅限本次测试的机密词/u);
    assert.doesNotMatch(stored, /answerCount/u);
    assert.match(stored, /"phase":"prepared"/u);
    assert.match(stored, /[a-f0-9]{64}/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

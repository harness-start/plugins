import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readState, statePath } from "../../../src/domains/reporting/lib/hook-state.js";
import { saveReport } from "../../../src/domains/reporting/lib/report-store.js";
import { executeReportCommand } from "../../../src/domains/reporting/lib/report-cli.js";

const ENTRY = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));
const HARNESS = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
const SAVE = `${HARNESS} report daily-save`;
const PREPARE = `${HARNESS} report daily-prepare`;
const ADDITION_PREPARE = `${HARNESS} report addition-prepare`;
const APPEND = `${HARNESS} report append`;

function runHook(mode, event, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "codex", ({ "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop", session: "SessionStart", prompt: "UserPromptSubmit", "user-prompt": "UserPromptSubmit", subagent: "SubagentStart", "subagent-stop": "SubagentStop" } as Record<string, string>)[mode] ?? mode], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
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

test("prompt mode auto-routes bounded work-report intents but ignores near-miss bug reports", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-public-"));
  const env = { HOME: home };
  try {
    const ordinary = await runHook("prompt", { cwd: home, session_id: "ordinary", prompt: "修复测试" }, env);
    assert.equal(ordinary.stdout, "");
    assert.equal(ordinary.stderr, "");

    const nearMiss = await runHook("prompt", { cwd: home, session_id: "bug", prompt: "报告 bug：保存按钮失效" }, env);
    assert.equal(nearMiss.stdout, "");
    const daily = await runHook("prompt", { cwd: home, session_id: "daily", prompt: "写今天的日报" }, env);
    assert.match(JSON.stringify(output(daily)), /\$work-report-authoring/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("V2 save requires an exact digest-bound acknowledgement before it is allowed", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-ack-"));
  const env = { HOME: home };
  const contract = join(home, "contract.json");
  const evidence = join(home, "evidence.json");
  const base = { cwd: home, session_id: "ack-flow" };
  writeFileSync(evidence, JSON.stringify({
    schema: "EvidenceBundleV2", window: { label: "2026-08-10", start: "2026-08-10T00:00:00Z", end: "2026-08-10T23:59:59Z" },
    sources: { transcript: { status: "collected", sessions: 1 }, git: { status: "skipped", repositories: 0 }, remote: { status: "skipped", items: 0 } },
    records: [{ id: "E1", type: "transcript-session", timestamp: "2026-08-10T10:00:00Z", locator: "codex:s1", digest: "a".repeat(64), ownership: "unverified", verification: "fact", summary: "session" }], dataGaps: [],
  }));
  writeFileSync(contract, JSON.stringify({
    schema: "WorkReportContractV2", period: { kind: "daily", label: "2026-08-10", start: "2026-08-10T00:00:00Z", end: "2026-08-10T23:59:59Z" },
    workItems: [{ id: "W1", action: "实现", result: "交付", impact: "可验证", status: "done", evidenceIds: ["E1"] }],
    improvementFindings: [{ id: "G1", observableBehavior: "验收记录晚于提交", impact: "复核延迟", basis: "fact", evidenceIds: ["E1"] }],
    priorCommitments: [], commitments: [{ id: "A1", findingIds: ["G1"], action: "同日验收", due: "2026-08-11", successSignal: "同日记录", verificationMethod: "检查时间" }],
    employeeDispositions: [{ findingId: "G1", status: "accepted", commitmentIds: ["A1"] }],
    tlVerification: [{ subjectId: "A1", method: "检查时间", owner: "TL", due: "2026-08-12", status: "pending" }], advisorRuns: [], dataGaps: [],
  }));
  const flags = `--date 2026-08-10 --contract ${contract} --evidence ${evidence}`;
  const prepare = `node ${PREPARE} ${flags}`;
  const save = `node ${SAVE} ${flags}`;
  try {
    await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: prepare } }, env);
    const state = await readState(base, env);
    assert.equal(state.phase, "prepared");
    assert.match(state.ackToken ?? "", /^[a-f0-9]{24}$/u);
    assert.equal(output(await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: save } }, env))?.hookSpecificOutput?.permissionDecision, "deny");
    const acknowledged = await runHook("prompt", { ...base, prompt: `# work-report-ack ${state.ackToken} | G1=accepted | commit=A1` }, env);
    assert.match(JSON.stringify(output(acknowledged)), /acknowledg/u);
    assert.equal((await readState(base, env)).phase, "acknowledged");
    assert.equal(output(await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: save } }, env)), null);
    const saved = await executeReportCommand({ kind: "daily", action: "save", argv: flags.split(" "), env });
    assert.equal(existsSync(String(saved.ledgerPath)), true);
    const receipt = await runHook("post", { ...base, tool_name: "exec_command", tool_input: { cmd: save }, tool_response: { exit_code: 0 } }, env);
    assert.match(JSON.stringify(output(receipt)), /Sealed report verified/u);
    assert.equal((await readState(base, env)).phase, "sealed");
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
    const recursive = await runHook("stop", { ...base, stop_hook_active: true, last_assistant_message: "周报已生成并保存。" }, env);
    assert.equal(output(recursive), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("SessionStart resumes only active workflows and PostToolUseFailure preserves recovery state", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-resume-"));
  const env = { HOME: home };
  const draft = join(home, "draft.md");
  const base = { cwd: home, session_id: "resume-flow" };
  writeFileSync(draft, "# 工作日报\n");
  const prepare = `node ${PREPARE} --date 2026-08-10 --input ${draft}`;
  const save = `node ${SAVE} --date 2026-08-10 --input ${draft}`;
  try {
    assert.doesNotMatch(JSON.stringify(output(await runHook("session", base, env))), /work-report workflow.*prepared/iu);
    await runHook("pre", { ...base, tool_name: "exec_command", tool_input: { cmd: prepare } }, env);
    assert.match(JSON.stringify(output(await runHook("session", base, env))), /prepared/u);
    const failed = await runHook("failure", { ...base, tool_name: "exec_command", tool_input: { cmd: save }, error: "disk full" }, env);
    assert.match(JSON.stringify(output(failed)), /State remains prepared/u);
    const state = await readState(base, env);
    assert.equal(state.phase, "prepared");
    assert.match(state.lastError ?? "", /save failed/u);
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

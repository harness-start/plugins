import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { preDisciplineFindings, recordOutcome } from "../scripts/checks/pre-rules.mjs";
import { postFileReports } from "../scripts/checks/file-checks.mjs";
import { languageDriftReport, markLanguageIntent } from "../scripts/checks/language.mjs";
import { ledgerResumeContext } from "../scripts/checks/ledger.mjs";
import { stopViolation } from "../scripts/checks/stop-gates.mjs";

const pre = fileURLToPath(new URL("../scripts/execution-hook-pre-tool.mjs", import.meta.url));
function run(entry, payload, env = process.env) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [entry], { env, stdio: ["pipe", "pipe", "pipe"] }); const out = [], err = []; child.stdout.on("data", (chunk) => out.push(chunk)); child.stderr.on("data", (chunk) => err.push(chunk)); child.once("error", reject); child.once("close", (code) => resolve({ code, stdout: Buffer.concat(out).toString("utf8").trim(), stderr: Buffer.concat(err).toString("utf8") })); child.stdin.end(JSON.stringify(payload)); }); }

test("pre rules deny backup artifacts, garbled writes, direct ledgers, and global skill installs", () => {
  const cases = [
    [{ tool_name: "Write", tool_input: { file_path: "src/app.js.bak", content: "x" } }, "Backup Artifact"],
    [{ tool_name: "Write", tool_input: { file_path: "src/app.js", content: "x��y" } }, "Garbled Text"],
    [{ tool_name: "Write", tool_input: { file_path: ".task-ledgers/work.md", content: "x" } }, "Task Ledger"],
    [{ tool_name: "Bash", tool_input: { command: "npx skills add owner/repo --global" } }, "External Skill Global"],
  ];
  for (const [event, id] of cases) { const command = event.tool_input.command ?? ""; const finding = preDisciplineFindings(event, command).find((item) => item.action === "deny"); assert.match(finding.id, new RegExp(id, "u")); }
});

test("find-skill isolation denies clone and dependency execution, but allows discovery", () => {
  const scoped = (command) => preDisciplineFindings({ cwd: "/work/project", active_skill: "find-skill", tool_name: "Bash", tool_input: { command } }, command);
  assert.match(scoped("git clone https://example.invalid/candidate.git")[0].id, /Isolation/u);
  assert.match(scoped("npm --prefix /tmp/candidate install")[0].id, /Isolation/u);
  assert.match(scoped("npm --prefix /tmp/candidate run test")[0].id, /Isolation/u);
  assert.equal(scoped("npx skills find review").length, 0);
});

test("pre entry returns blocking contract for backup artifact", async () => { const result = await run(pre, { tool_name: "Write", tool_input: { file_path: "src/app.js.old", content: "x" } }); assert.equal(result.code, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(output.hookSpecificOutput.permissionDecision, "deny"); assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract/u); });

test("retry state reports and blocks repeated failed commands", () => {
  const root = mkdtempSync(join(tmpdir(), "execution-state-")), previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = root; const event = { session_id: "retry", cwd: "/work" }, command = "npm test";
  try { for (let i = 0; i < 2; i += 1) recordOutcome(event, command, "failure"); assert.equal(preDisciplineFindings(event, command).find((item) => item.id === "Error Retry Guard").action, "report"); for (let i = 0; i < 2; i += 1) recordOutcome(event, command, "failure"); assert.equal(preDisciplineFindings(event, command).find((item) => item.id === "Error Retry Guard").action, "deny"); } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(root, { recursive: true, force: true }); }
});

test("post checks report JSON syntax, net-new debt, plan debt, and edit loops", () => {
  const root = mkdtempSync(join(tmpdir(), "execution-files-")), state = mkdtempSync(join(tmpdir(), "execution-state-")), previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = state;
  try {
    const json = join(root, "bad.json"); writeFileSync(json, "{ bad }"); assert.match(postFileReports({ session_id: "files" }, json).join("\n"), /JSON Syntax/u);
    const source = join(root, "app.js"); writeFileSync(source, "// TODO: later\n"); assert.match(postFileReports({ session_id: "files" }, source, { old_string: "", new_string: "// TODO: later\n" }).join("\n"), /Debt Marker/u);
    const plan = join(root, "PLAN.md"); writeFileSync(plan, "TODO launch\n"); assert.match(postFileReports({ session_id: "files" }, plan, { old_string: "", new_string: "TODO launch\n" }).join("\n"), /Plan Debt/u);
    for (let i = 0; i < 4; i += 1) postFileReports({ session_id: "loop" }, source); assert.match(postFileReports({ session_id: "loop" }, source).join("\n"), /Edit Loop/u);
  } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(root, { recursive: true, force: true }); rmSync(state, { recursive: true, force: true }); }
});

test("language intent authorizes requested Japanese but reports unrequested Korean", () => {
  const root = mkdtempSync(join(tmpdir(), "language-state-")), previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = root; const event = { session_id: "lang" };
  try { markLanguageIntent(event, "请使用日语回答"); assert.equal(languageDriftReport(event, "これは日本語の文章です。これは明示的に許可された出力です。"), null); assert.match(languageDriftReport(event, "이 문장은 사용자가 요청하지 않은 한국어 출력이며 충분히 긴 예시입니다."), /Language Drift/u); } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(root, { recursive: true, force: true }); }
});

test("session resume finds unfinished ledger and reasoning stop blocks shallow guarantee", () => {
  const root = mkdtempSync(join(tmpdir(), "ledger-")); mkdirSync(join(root, ".task-ledgers")); writeFileSync(join(root, ".task-ledgers", "work.md"), "# Long Task Ledger\n- goal: finish migration\n## Shards\n| id | scope | status | evidence | evidence_refs | notes |\n| --- | --- | --- | --- | --- | --- |\n| p1 | code | in_progress | | [] | |\n## Resume\n- next shard: p1\n"); assert.match(ledgerResumeContext(root), /finish migration/u);
  const state = mkdtempSync(join(tmpdir(), "stop-state-")), previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = state; try { assert.match(stopViolation({ session_id: "stop", prompt: "为什么能保证一定正确？", final_output: "可以，已经正确。" }), /Reasoning Depth Gate/u); } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(state, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});

test("reasoning stop requires an independent review for a guarantee answer", () => {
  const state = mkdtempSync(join(tmpdir(), "reasoning-review-")), previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = state;
  try { const event = { session_id: "review", prompt: "证明这个最坏情况保证", final_output: "因为最坏情况存在下界，所以该上界可以保证。最终答案：7。" }; assert.match(stopViolation(event), /Verification Gate/u); assert.equal(stopViolation(event), null); } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(state, { recursive: true, force: true }); }
});

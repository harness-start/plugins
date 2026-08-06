import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { postReports } from "../scripts/checks/post-files.mjs";
import { specPlanViolation } from "../scripts/checks/spec-plan.mjs";
import { stopViolation } from "../scripts/checks/stop-gates.mjs";
import { trackTdd } from "../scripts/checks/tdd.mjs";

const pre = fileURLToPath(new URL("../scripts/delivery-hook-pre-tool.mjs", import.meta.url)), post = fileURLToPath(new URL("../scripts/delivery-hook-post-tool.mjs", import.meta.url)), stop = fileURLToPath(new URL("../scripts/delivery-hook-stop.mjs", import.meta.url));
function run(entry, payload, env = process.env) { return new Promise((resolveResult, reject) => { const child = spawn(process.execPath, [entry], { env, stdio: ["pipe", "pipe", "pipe"] }), out = [], err = []; child.stdout.on("data", (chunk) => out.push(chunk)); child.stderr.on("data", (chunk) => err.push(chunk)); child.once("error", reject); child.once("close", (code) => resolveResult({ code, stdout: Buffer.concat(out).toString("utf8").trim(), stderr: Buffer.concat(err).toString("utf8") })); child.stdin.end(JSON.stringify(payload)); }); }
function workspace(prefix = "delivery-") { return mkdtempSync(join(tmpdir(), prefix)); }
function receipt(root, record, run = "run-1") { const dir = join(root, ".process-confidence", "runs", run, "receipts"); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${record.id ?? Math.random()}.json`), `${JSON.stringify({ id: record.id ?? "receipt", runId: run, sessionId: "s1", kind: "verify", command: "tool", exitCode: 0, outcome: "pass", at: new Date().toISOString(), issuer: "pcf-tool", ...record })}\n`); }
const done = "✅ DONE\n";

test("spec plan gate blocks unresolved sibling spec and entry returns deny contract", async () => {
  const root = workspace(); mkdirSync(join(root, ".specs", "login"), { recursive: true }); writeFileSync(join(root, ".specs", "login", "spec.md"), "# Requirement: Login\n## Scenario: valid\n[NEEDS CLARIFICATION: backend]\n");
  const event = { cwd: root, tool_name: "Write", tool_input: { file_path: ".specs/login/plan.md", content: "plan" } };
  assert.match(specPlanViolation(event), /blockingContract/u);
  const result = await run(pre, event); assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny"); rmSync(root, { recursive: true, force: true });
});

test("post checks report API deletion, missing docs link, encoding, and design contract drift", () => {
  const root = workspace();
  try {
    const route = join(root, "routes", "api.js"); mkdirSync(join(root, "routes")); writeFileSync(route, "export default {}\n"); assert.match(postReports({ tool_name: "Edit", tool_input: { file_path: route, old_string: "router.get('/v1/users', h)", new_string: "" } }).join("\n"), /API Breaking/u);
    const md = join(root, "README.md"); writeFileSync(md, "[missing](./nope.md)\n"); assert.match(postReports({ tool_name: "Write", tool_input: { file_path: md } }).join("\n"), /Docs Consistency/u);
    const xml = join(root, "doc.xml"); writeFileSync(xml, Buffer.from([0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e])); assert.match(postReports({ tool_name: "Write", tool_input: { file_path: xml } }).join("\n"), /Encoding/u);
    writeFileSync(join(root, "DESIGN.md"), "colors: #ffffff\nspacing: 8px\n"); const css = join(root, "screen.css"); writeFileSync(css, ".x{color:#ff0000}\n"); assert.match(postReports({ tool_name: "Edit", tool_input: { file_path: css, old_string: ".x{}", new_string: ".x{color:#ff0000}" } }).join("\n"), /Design Contract Drift/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Post entry emits advisory context after a write", async () => {
  const root = workspace(); try { const path = join(root, "README.md"); writeFileSync(path, "[missing](./nope.md)\n"); const result = await run(post, { cwd: root, tool_name: "Write", tool_input: { file_path: path } }); assert.equal(result.code, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse"); assert.match(output.hookSpecificOutput.additionalContext, /Docs Consistency/u); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verification provenance requires evidence beside a success claim", () => {
  const root = workspace(); try { const bare = { cwd: root, session_id: "s1", final_output: `${done}测试通过。` }; assert.match(stopViolation(bare), /Verification Provenance/u); assert.equal(stopViolation({ ...bare, final_output: `${done}[本地实测] \`node --test\`：测试通过。` }), null); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("design, video, and GitLab completion gates require matching receipt-backed tags", () => {
  const cases = [
    ["design-review", "design-accessibility-evidence-gate", "Design Accessibility", "verification"],
    ["video-quality-review", "video-media-probe", "Video Production", "verification"],
    ["agentic-fix-review-gate", "gitlab-work-items-comment", "GitLab Review", "mutation"],
  ];
  for (const [skill, tool, label, kind] of cases) { const root = workspace(); try { let initial = done; if (skill === "video-quality-review") { receipt(root, { id: "design-r", toolId: "design-accessibility-evidence-gate", invocationId: "design-1", evidenceKind: "verification" }); initial += "[MCP实测:design-accessibility-evidence-gate@design-1]"; } const event = { cwd: root, session_id: "s1", active_skill_ids: [skill], final_output: initial }; assert.match(stopViolation(event), new RegExp(label, "u")); receipt(root, { id: `${tool}-r`, toolId: tool, invocationId: "i1", evidenceKind: kind }); if (skill === "video-quality-review") receipt(root, { id: "frame-r", toolId: "video-frame-sample", invocationId: "i2", evidenceKind: "verification" }); if (skill === "agentic-fix-review-gate") { receipt(root, { id: "note-r", toolId: "gitlab-work-items-mr-note", invocationId: "i2", evidenceKind: "mutation" }); receipt(root, { id: "update-r", toolId: "gitlab-work-items-update", invocationId: "i3", evidenceKind: "mutation" }); } const tags = skill === "video-quality-review" ? "[MCP实测:video-media-probe@i1] [MCP实测:video-frame-sample@i2]" : skill === "agentic-fix-review-gate" ? "[MCP实测:gitlab-work-items-comment@i1] [MCP实测:gitlab-work-items-mr-note@i2] [MCP实测:gitlab-work-items-update@i3]" : `[MCP实测:${tool}@i1]`; assert.equal(stopViolation({ ...event, final_output: `${initial}${tags}` }), null); } finally { rmSync(root, { recursive: true, force: true }); } }
});

test("design evidence older than the last workspace mutation is stale", () => {
  const root = workspace(); try { receipt(root, { toolId: "design-accessibility-evidence-gate", invocationId: "old", evidenceKind: "verification", at: "2026-01-01T00:00:00Z" }); const event = { cwd: root, session_id: "s1", active_skill_ids: ["design-review"], telemetry: [{ telemetry_event_type: "workspace_mutation", session_id: "s1", ts: Date.parse("2026-02-01T00:00:00Z") }], final_output: `${done}[MCP实测:design-accessibility-evidence-gate@old]` }; assert.match(stopViolation(event), /Design Accessibility/u); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("TDD tracker records red-green order and completion gate reads plugin state", () => {
  const root = workspace(), state = workspace("delivery-state-"), previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = state; const base = { cwd: root, session_id: "s1", active_skill_ids: ["test-driven-development"] };
  try { const testFile = join(root, "tests", "app.test.js"), source = join(root, "src", "app.js"); mkdirSync(join(root, "tests")); mkdirSync(join(root, "src")); writeFileSync(testFile, "test('x',()=>{})"); writeFileSync(source, "export {}\n"); trackTdd({ ...base, tool_name: "Write", tool_input: { file_path: testFile } }); trackTdd({ ...base, tool_name: "Bash", tool_input: { command: "node --test" }, tool_response: { exit_code: 1 } }); trackTdd({ ...base, tool_name: "Edit", tool_input: { file_path: source } }); assert.match(stopViolation({ ...base, final_output: done }), /TDD Sequence/u); trackTdd({ ...base, tool_name: "Bash", tool_input: { command: "node --test" }, tool_response: { exit_code: 0 } }); assert.equal(stopViolation({ ...base, final_output: done }), null); } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(root, { recursive: true, force: true }); rmSync(state, { recursive: true, force: true }); }
});

test("PPTX completion verifies receipt tag and artifact hashes", () => {
  const root = workspace(); try { const artifact = join(root, "deck.pptx"), manifest = join(root, "release.json"); writeFileSync(artifact, "deck"); writeFileSync(manifest, JSON.stringify({ pptx: { path: "deck.pptx", sha256: createHash("sha256").update("deck").digest("hex") } })); receipt(root, { toolId: "pptx-deck-authoring-pptx-release", invocationId: "release-1", evidenceKind: "mutation", effectScope: "local-artifact" }); receipt(root, { id: "design-r", toolId: "design-accessibility-evidence-gate", invocationId: "design-1", evidenceKind: "verification" }); const event = { cwd: root, session_id: "s1", active_skill_ids: ["pptx-deck-authoring"], final_output: `${done}[MCP实测:design-accessibility-evidence-gate@design-1] [MCP实测:pptx-deck-authoring-pptx-release@release-1] [PPTX发布:release.json]` }; assert.equal(stopViolation(event), null); writeFileSync(artifact, "changed"); assert.match(stopViolation(event), /PPTX Completion/u); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration and long-task ledger gates reject incomplete completion state", () => {
  const migration = workspace(); try { mkdirSync(join(migration, ".migration-parity")); writeFileSync(join(migration, ".migration-parity", "work.md"), "| id | source | target | status |\n| --- | --- | --- | --- |\n| api | old | new | unverified |\n"); assert.match(stopViolation({ cwd: migration, active_skill_ids: ["migration-parity-review"], final_output: done }), /Migration Parity/u); } finally { rmSync(migration, { recursive: true, force: true }); }
  const ledger = workspace(); try { mkdirSync(join(ledger, ".task-ledgers")); writeFileSync(join(ledger, ".task-ledgers", "work.md"), "| id | scope | status | evidence | evidence_refs | notes |\n| --- | --- | --- | --- | --- | --- |\n| p1 | code | in_progress | | [] | |\n## Resume\n- next shard: p1\n- recovery commands:\n  - npm test\n"); assert.match(stopViolation({ cwd: ledger, active_skill_ids: ["long-task-context-governance"], final_output: done }), /Task Ledger/u); } finally { rmSync(ledger, { recursive: true, force: true }); }
});

test("external effects require a subject-matched verifier receipt", () => {
  const root = workspace(); try { receipt(root, { id: "mut", toolId: "publish", invocationId: "m1", evidenceKind: "mutation", completionPolicy: "requires-verifier", completionSubjectDigest: "abc", completionVerifierToolIds: ["publish-verify"] }); const event = { cwd: root, session_id: "s1", final_output: done }; assert.match(stopViolation(event), /External Effect Closure/u); receipt(root, { id: "verify", toolId: "publish-verify", invocationId: "v1", evidenceKind: "verification", verifiesInvocationId: "m1", completionSubjectDigest: "abc" }); assert.equal(stopViolation(event), null); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("delivery closure rejects dirty CI-gated repositories without remote evidence", () => {
  const root = workspace(); try { const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" }); git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid"); writeFileSync(join(root, "AGENTS.md"), "Use ci-gated-mr-workflow; local verification cannot replace remote CI.\n"); writeFileSync(join(root, ".gitlab-ci.yml"), "test:\n  script: true\n"); writeFileSync(join(root, "app.js"), "export {};\n"); git("add", "."); git("commit", "-m", "init"); git("remote", "add", "origin", "https://example.invalid/repo.git"); writeFileSync(join(root, "app.js"), "export const changed = true;\n"); assert.match(stopViolation({ cwd: root, final_output: done }), /Delivery Closure/u); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("next-step gates reject delegating locally solvable verification", () => {
  const root = workspace(); try { const event = { cwd: root, final_output: `${done}未验证项：尚未运行测试。\n\n## 下一步推荐\n- 请用户运行 npm test 完成验证。` }; assert.match(stopViolation(event), /Next Step Solvability/u); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Stop entry emits the host blocking contract", async () => {
  const root = workspace(); try { const result = await run(stop, { cwd: root, final_output: `${done}测试通过。` }); assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).decision, "block"); } finally { rmSync(root, { recursive: true, force: true }); }
});

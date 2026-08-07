import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  commandHash,
  commandReliability,
  parseCiResult,
  parseVerificationSummary,
  classifyCommand,
} from "../scripts/lib/command-policy.mjs";
import { resolveConfig } from "../scripts/lib/config.mjs";
import { detectUnsupportedClaims } from "../scripts/lib/claims.mjs";
import { validateEvidence } from "../scripts/lib/evidence.mjs";

function root() {
  const directory = mkdtempSync(join(tmpdir(), "verification-provenance-"));
  execFileSync("git", ["init", "-q"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: directory });
  writeFileSync(join(directory, "README.md"), "ok\n");
  execFileSync("git", ["add", "README.md"], { cwd: directory });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: directory });
  return directory;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("claim detector catches bare conclusions but ignores examples, quotes, and negation", () => {
  assert.deepEqual(detectUnsupportedClaims("单元测试全部通过。"), ["validation"]);
  assert.deepEqual(detectUnsupportedClaims("报告已生成：`reports/a.md`。"), ["artifact"]);
  assert.deepEqual(detectUnsupportedClaims("GitLab pipeline 43865 success。"), ["ci"]);
  assert.deepEqual(detectUnsupportedClaims("测试尚未通过。"), []);
  assert.deepEqual(detectUnsupportedClaims("> 示例：单元测试全部通过。\n\n```text\nCI passed\n```"), []);
  assert.deepEqual(detectUnsupportedClaims("单元测\u200b试全部通\u200b过。"), ["validation"]);
  assert.deepEqual(detectUnsupportedClaims("数据库迁移已验证。", [/数据库迁移已验证/u]), ["custom"]);
});

test("config accepts bounded custom claim and command patterns", () => {
  const warnings = [];
  const config = resolveConfig({
    claims: { additionalPatterns: [/数据库迁移已验证/u, "invalid"] },
    commands: { testPatterns: [/\bvitest\b/u] },
  }, (message) => warnings.push(message));
  assert.equal(config.claims.additionalPatterns.length, 1);
  assert.equal(config.commands.testPatterns.length, 1);
  assert.match(warnings.join("\n"), /claims\.additionalPatterns\[1\]/u);
});

test("command classifier and reliability reject failure masking and mutating verification", () => {
  assert.equal(classifyCommand("node --test tests/*.test.mjs"), "test");
  assert.equal(classifyCommand("npm run lint"), "verification");
  assert.equal(classifyCommand("glab api projects/1/pipelines/2"), "ci");
  assert.equal(classifyCommand("git commit -m test"), "external");
  assert.equal(classifyCommand("git push origin feature"), "external");
  assert.equal(classifyCommand("sed -i s/a/b/ src/a.js"), "mutation");
  assert.equal(commandReliability("node --test || true").reliable, false);
  assert.equal(commandReliability("node --test | tail -20").reliable, false);
  assert.equal(commandReliability("set -o pipefail; node --test | tail -20").reliable, true);
  assert.equal(commandReliability("eslint --fix src").reliable, false);
  assert.equal(commandReliability("node --test && sed -i s/a/b/ src/app.js").workspaceMutation, true);
  assert.equal(commandReliability("node --test > reports/test.log").workspaceMutation, true);
});

test("stateful custom command patterns are stable across repeated classification", () => {
  const config = { testPatterns: [/\bmy-test\b/gu] };
  assert.equal(classifyCommand("my-test" , config), "test");
  assert.equal(classifyCommand("my-test" , config), "test");
});

test("verification summaries are bounded and structured", () => {
  assert.deepEqual(parseVerificationSummary("# pass 15\n# fail 0\n# skipped 2\n"), { passed: 15, failed: 0, skipped: 2 });
  assert.deepEqual(parseVerificationSummary("================ 7 passed, 1 skipped in 0.2s ================"), { passed: 7, skipped: 1 });
  assert.deepEqual(parseVerificationSummary("OK (12 tests, 30 assertions)"), { passed: 12, failed: 0 });
  assert.equal(parseVerificationSummary("success"), null);
});

test("CI parser requires structured success, sha, id, and URL", () => {
  const parsed = parseCiResult(JSON.stringify({ id: 43865, status: "success", sha: "a".repeat(40), web_url: "https://git.example/p/1" }), "gitlab");
  assert.deepEqual(parsed, { provider: "gitlab", pipelineId: "43865", status: "success", sha: "a".repeat(40), url: "https://git.example/p/1" });
  assert.equal(parseCiResult(JSON.stringify({ id: 1, status: "failed", sha: "a".repeat(40), web_url: "https://git.example/p/1" }), "gitlab"), null);
  assert.equal(parseCiResult("pipeline passed", "gitlab"), null);
});

test("command evidence must match a reliable current-revision receipt and exact summary", async () => {
  const workspaceRoot = root();
  try {
    const command = "node --test tests/*.test.mjs";
    const item = { id: "E1", kind: "command", command, exitCode: 0, summary: { passed: 15, failed: 0 } };
    const base = {
      revision: 3,
      receipts: [{ commandHash: commandHash(command), class: "test", outcome: "success", reliable: true, revision: 3, summary: { passed: 15, failed: 0 } }],
    };
    assert.deepEqual(await validateEvidence(item, "test_suite_passed", { state: base, workspaceRoot, maxArtifactBytes: 1024 }), []);
    assert.match((await validateEvidence(item, "test_suite_passed", { state: { ...base, revision: 4 }, workspaceRoot, maxArtifactBytes: 1024 }))[0], /after the last mutation/u);
    assert.match((await validateEvidence({ ...item, summary: { passed: 14, failed: 0 } }, "test_suite_passed", { state: base, workspaceRoot, maxArtifactBytes: 1024 }))[0], /summary/u);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("artifact evidence validates containment, type, bytes, digest, and format", async () => {
  const workspaceRoot = root();
  try {
    mkdirSync(join(workspaceRoot, "reports"));
    const content = "{\"ok\":true}\n";
    writeFileSync(join(workspaceRoot, "reports", "result.json"), content);
    const item = { id: "E1", kind: "artifact", path: "reports/result.json", format: "json", bytes: Buffer.byteLength(content), sha256: sha256(content) };
    assert.deepEqual(await validateEvidence(item, "artifact_materialized", { state: {}, workspaceRoot, maxArtifactBytes: 1024 }), []);
    assert.match((await validateEvidence({ ...item, sha256: "0".repeat(64) }, "artifact_materialized", { state: {}, workspaceRoot, maxArtifactBytes: 1024 }))[0], /sha256/u);
    assert.match((await validateEvidence({ ...item, path: "../outside.json" }, "artifact_materialized", { state: {}, workspaceRoot, maxArtifactBytes: 1024 }))[0], /workspace/u);
    symlinkSync(join(workspaceRoot, "reports", "result.json"), join(workspaceRoot, "reports", "link.json"));
    assert.match((await validateEvidence({ ...item, path: "reports/link.json" }, "artifact_materialized", { state: {}, workspaceRoot, maxArtifactBytes: 1024 }))[0], /symbolic link/u);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("git evidence is checked against live repository state", async () => {
  const workspaceRoot = root();
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, encoding: "utf8" }).trim();
    const item = { id: "E1", kind: "git", head, branch: "master", clean: true };
    assert.deepEqual(await validateEvidence(item, "git_state_matches", { state: {}, workspaceRoot, maxArtifactBytes: 1024 }), []);
    writeFileSync(join(workspaceRoot, "README.md"), "changed\n");
    assert.match((await validateEvidence(item, "git_state_matches", { state: {}, workspaceRoot, maxArtifactBytes: 1024 }))[0], /clean state/u);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("CI evidence binds query receipt to id, sha, status, and URL", async () => {
  const workspaceRoot = root();
  try {
    const query = "glab api projects/1/pipelines/43865";
    const ci = { provider: "gitlab", pipelineId: "43865", status: "success", sha: "a".repeat(40), url: "https://git.example/pipelines/43865" };
    const item = { id: "E1", kind: "ci", ...ci, query };
    const state = { revision: 2, receipts: [{ commandHash: commandHash(query), class: "ci", outcome: "success", reliable: true, revision: 2, ci }] };
    assert.deepEqual(await validateEvidence(item, "ci_pipeline_succeeded", { state, workspaceRoot, maxArtifactBytes: 1024 }), []);
    assert.match((await validateEvidence({ ...item, sha: "b".repeat(40) }, "ci_pipeline_succeeded", { state, workspaceRoot, maxArtifactBytes: 1024 }))[0], /CI metadata/u);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

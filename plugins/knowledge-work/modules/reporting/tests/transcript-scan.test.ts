import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildReportWindow,
  collectTranscriptActivity,
  sanitizeSnippet,
  scanTranscripts,
} from "../src/lib/transcript-scan.js";

test("buildReportWindow creates separate daily, ISO-week, and inclusive range windows", () => {
  const daily = buildReportWindow({ kind: "daily", date: "2026-08-10" });
  const weekly = buildReportWindow({ kind: "weekly", week: "2026-W33" });
  const summary = buildReportWindow({ kind: "summary", from: "2026-08-01", to: "2026-08-10" });

  assert.equal(daily.label, "2026-08-10");
  assert.equal(weekly.label, "2026-W33");
  assert.equal(summary.label, "2026-08-01_to_2026-08-10");
  assert.equal(weekly.endMs - weekly.startMs + 1, 7 * 24 * 60 * 60 * 1000);
  assert.equal(summary.endMs - summary.startMs + 1, 10 * 24 * 60 * 60 * 1000);
});

test("scanTranscripts combines Claude and Codex sessions with line citations and bad-line gaps", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-scan-"));
  const claudeRoot = join(home, "claude-config", "projects", "p1");
  const codexRoot = join(home, "codex-home", "sessions", "2026", "08", "10");
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  const window = buildReportWindow({ kind: "daily", date: "2026-08-10" });
  const inside = new Date(window.startMs + 60 * 60 * 1000).toISOString();

  writeFileSync(join(claudeRoot, "session.jsonl"), [
    JSON.stringify({ timestamp: inside, sessionId: "claude-1", cwd: `${home}/customer-a`, message: { role: "user", content: "用 $daily-work-report 总结支付排查，token=secret-value" } }),
    "{bad json",
    JSON.stringify({ timestamp: inside, sessionId: "claude-1", message: { role: "assistant", content: [{ type: "tool_use", name: "Read", id: "tool-1" }] } }),
  ].join("\n"));
  writeFileSync(join(codexRoot, "rollout-test.jsonl"), `${JSON.stringify({ timestamp: inside, type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "完成离线验收并记录执行不足" }] } })}\n`);

  try {
    const report = await scanTranscripts({
      window,
      platform: "all",
      maxSessions: 10,
      env: {
        HOME: home,
        CLAUDE_CONFIG_DIR: join(home, "claude-config"),
        CODEX_HOME: join(home, "codex-home"),
      },
    });
    assert.equal(report.overview.sessionCount, 2);
    assert.equal(report.sessions.some((session) => session.platform === "claude"), true);
    assert.equal(report.sessions.some((session) => session.platform === "codex"), true);
    assert.equal(report.dataGaps.some((gap) => /malformed JSONL/u.test(gap)), true);
    assert.match(JSON.stringify(report), /"line":1/u);
    assert.doesNotMatch(JSON.stringify(report), /secret-value/u);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(home.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("collectTranscriptActivity returns EvidenceBundleV2 and honors Git opt-out", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-collect-"));
  try {
    const result = await collectTranscriptActivity({
      kind: "daily",
      date: "2026-08-10",
      skipGit: true,
      skipRemote: true,
      env: { HOME: home, CLAUDE_CONFIG_DIR: join(home, "missing"), CODEX_HOME: join(home, "missing-codex") },
    });
    assert.equal(result.evidence.schema, "EvidenceBundleV2");
    assert.equal(result.evidence.sources.git.status, "skipped");
    assert.equal(result.dataGaps.length > 0, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("sanitizeSnippet removes common credentials and absolute home paths", () => {
  assert.equal(
    sanitizeSnippet("Authorization: Bearer abcdefghijk /home/alice/private", "/home/alice"),
    "Authorization: Bearer [REDACTED] ~/.ai-experts-path",
  );
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  detectReportIntent,
  officialScriptTrusted,
  parseOfficialCommand,
  protectionDecision,
} from "../scripts/lib/hook-policy.mjs";

test("detectReportIntent routes three report skills and ignores ordinary requests", () => {
  assert.equal(detectReportIntent("请帮我写今天的日报"), "daily");
  assert.equal(detectReportIntent("生成本周周报"), "weekly");
  assert.equal(detectReportIntent("做一份阶段工作总结"), "summary");
  assert.equal(detectReportIntent("补充今天的日报"), "daily");
  assert.equal(detectReportIntent("修复这个单元测试"), null);
});

test("protectionDecision denies direct report writes and recursive parent deletion", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  const target = join(home, ".ai-experts", "daily-reports", "2026-08-10.md");
  try {
    const direct = await protectionDecision({
      cwd: home,
      tool_name: "Write",
      tool_input: { file_path: target, content: "tampered" },
    }, { home, state: { phase: "idle" } });
    assert.equal(direct.deny, true);

    const recursive = await protectionDecision({
      cwd: home,
      tool_name: "exec_command",
      tool_input: { cmd: `rm -rf ${join(home, ".ai-experts")}` },
    }, { home, state: { phase: "idle" } });
    assert.equal(recursive.deny, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("protectionDecision resolves a symlink before allowing a file mutation", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  const reports = join(home, ".ai-experts", "daily-reports");
  const target = join(reports, "2026-08-10.md");
  const link = join(home, "report-link.md");
  mkdirSync(reports, { recursive: true });
  writeFileSync(target, "draft\n");
  symlinkSync(target, link);
  try {
    const decision = await protectionDecision({
      cwd: home,
      tool_name: "Edit",
      tool_input: { file_path: link, old_string: "draft", new_string: "changed" },
    }, { home, state: { phase: "idle" } });
    assert.equal(decision.deny, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("protectionDecision allows read-only inspection of a sealed report", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  const report = join(home, ".ai-experts", "daily-reports", "2026-08-10.md");
  const decision = await protectionDecision({
    cwd: home,
    tool_name: "exec_command",
    tool_input: { cmd: `sha256sum ${report}` },
  }, { home, state: { phase: "idle" } });
  assert.equal(decision.deny, false);
  rmSync(home, { recursive: true, force: true });
});

test("officialScriptTrusted rejects a different script that only copies an official basename", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  const fake = join(home, "daily-work-report-save.mjs");
  writeFileSync(fake, "process.exit(0);\n");
  try {
    const official = parseOfficialCommand(`node ${fake} --date 2026-08-10 --input ${join(home, "draft.md")}`);
    assert.equal(await officialScriptTrusted(official, { pluginRoot: join(home, "real-plugin"), cwd: home }), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("parseOfficialCommand rejects shell overrides of the host-owned plugin root", () => {
  const parsed = parseOfficialCommand('PLUGIN_ROOT=/tmp node "${PLUGIN_ROOT}/scripts/daily-work-report-save.mjs" --date 2026-08-10 --input /tmp/draft.md');
  assert.match(parsed?.error ?? "", /must not be overridden/u);
});

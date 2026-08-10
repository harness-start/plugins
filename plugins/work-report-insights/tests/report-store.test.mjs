import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  appendReport,
  reportPath,
  saveReport,
} from "../scripts/lib/report-store.mjs";
import { verifyReport } from "../scripts/lib/report-integrity.mjs";

test("saveReport seals a daily report and refuses to replace its confirmed body", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-home-"));
  const input = join(home, "draft.md");
  writeFileSync(input, "# 工作日报\n\n## 今日完成\n\n- 完成测试\n");

  try {
    const saved = await saveReport({ kind: "daily", date: "2026-08-10", input, home });
    assert.equal(saved.path, join(home, ".ai-experts", "daily-reports", "2026-08-10.md"));
    assert.equal(verifyReport(readFileSync(saved.path, "utf8")).ok, true);
    await assert.rejects(
      saveReport({ kind: "daily", date: "2026-08-10", input, home }),
      /already sealed/u,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("appendReport preserves every sealed byte and adds confirmed content after the marker", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-home-"));
  const input = join(home, "draft.md");
  const addition = join(home, "addition.md");
  writeFileSync(input, "# 周报\n\n## 本周成果\n\n- A\n");
  writeFileSync(addition, "补充了线下沟通结果。\n");

  try {
    const saved = await saveReport({ kind: "weekly", week: "2026-W33", input, home });
    const before = readFileSync(saved.path, "utf8");
    await appendReport({ report: saved.path, input: addition, home, now: "2026-08-10T18:00:00+08:00" });
    const after = readFileSync(saved.path, "utf8");
    assert.equal(after.startsWith(before), true);
    assert.match(after.slice(before.length), /补充了线下沟通结果/u);
    assert.equal(verifyReport(after).ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reportPath exposes separate daily, weekly, and range contracts without mode", () => {
  const home = "/tmp/example-home";
  assert.equal(reportPath({ kind: "daily", date: "2026-08-10", home }), "/tmp/example-home/.ai-experts/daily-reports/2026-08-10.md");
  assert.equal(reportPath({ kind: "weekly", week: "2026-W33", home }), "/tmp/example-home/.ai-experts/weekly-reports/2026-W33.md");
  assert.equal(reportPath({ kind: "summary", from: "2026-08-01", to: "2026-08-10", home }), "/tmp/example-home/.ai-experts/work-summary-reports/2026-08-01_to_2026-08-10.md");
});

test("saveReport rejects a report directory that resolves through a symlink", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-home-"));
  const outside = mkdtempSync(join(tmpdir(), "work-report-outside-"));
  const input = join(home, "draft.md");
  mkdirSync(join(home, ".ai-experts"), { recursive: true });
  symlinkSync(outside, join(home, ".ai-experts", "daily-reports"));
  writeFileSync(input, "# 工作日报\n");
  try {
    await assert.rejects(
      saveReport({ kind: "daily", date: "2026-08-10", input, home }),
      /symbolic-link/u,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

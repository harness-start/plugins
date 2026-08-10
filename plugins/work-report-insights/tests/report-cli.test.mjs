import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  executeReportCommand,
  parseReportArgs,
} from "../scripts/lib/report-cli.mjs";

test("parseReportArgs rejects the removed mode parameter", () => {
  assert.throws(
    () => parseReportArgs("daily", "collect", ["--mode", "weekly"]),
    /unknown argument: --mode/u,
  );
});

test("daily prepare returns a body-bound candidate without writing the report", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-cli-"));
  const input = join(home, "draft.md");
  writeFileSync(input, "# 工作日报\n");
  try {
    const result = await executeReportCommand({
      kind: "daily",
      action: "prepare",
      argv: ["--date", "2026-08-10", "--input", input],
      env: { HOME: home },
    });
    assert.equal(result.kind, "daily");
    assert.equal(result.action, "prepare");
    assert.match(result.candidateSha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.target.endsWith("/.ai-experts/daily-reports/2026-08-10.md"), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("skip-git remains an accepted no-op on the daily collect compatibility seam", () => {
  const parsed = parseReportArgs("daily", "collect", ["--date", "2026-08-10", "--skip-git"]);
  assert.equal(parsed.date, "2026-08-10");
  assert.equal(parsed.skipGit, true);
});

test("daily and weekly commands default to the current local period", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-cli-"));
  try {
    const daily = await executeReportCommand({ kind: "daily", action: "collect", argv: [], env: { HOME: home }, now: new Date(2026, 7, 10, 12).getTime() });
    const weekly = await executeReportCommand({ kind: "weekly", action: "collect", argv: [], env: { HOME: home }, now: new Date(2026, 7, 10, 12).getTime() });
    assert.equal(daily.label, "2026-08-10");
    assert.equal(weekly.label, "2026-W33");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  executeReportCommand,
  parseReportArgs,
} from "../../../src/domains/reporting/lib/report-cli.js";
import type { EvidenceBundleV2 } from "../../../src/domains/reporting/lib/work-evidence.js";
import type { WorkReportContractV2 } from "../../../src/domains/reporting/lib/report-contract.js";

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

test("evidence flags support real opt-outs, repeated repositories, and bounded caps", () => {
  const parsed = parseReportArgs("daily", "collect", [
    "--date", "2026-08-10", "--skip-git", "--skip-remote",
    "--repo", "/a", "--repo", "/b", "--max-repos", "4", "--max-commits", "25",
  ]);
  assert.equal(parsed.date, "2026-08-10");
  assert.equal(parsed.skipGit, true);
  assert.equal(parsed.skipRemote, true);
  assert.deepEqual(parsed.repos, ["/a", "/b"]);
  assert.equal(parsed.maxRepos, 4);
  assert.equal(parsed.maxCommits, 25);
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

test("V2 prepare and save render a validated contract and emit a bound machine ledger", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-cli-v2-"));
  const contractPath = join(home, "contract.json");
  const evidencePath = join(home, "evidence.json");
  const evidence: EvidenceBundleV2 = {
    schema: "EvidenceBundleV2",
    window: { label: "2026-08-10", start: "2026-08-10T00:00:00.000Z", end: "2026-08-10T23:59:59.999Z" },
    sources: { transcript: { status: "collected", sessions: 0 }, git: { status: "skipped", repositories: 0 }, remote: { status: "skipped", items: 0 } },
    records: [{ id: "E1", type: "transcript-session", timestamp: "2026-08-10T10:00:00Z", locator: "codex:s1", digest: "a".repeat(64), ownership: "unverified", verification: "fact", summary: "session" }],
    dataGaps: [],
  };
  const contract: WorkReportContractV2 = {
    schema: "WorkReportContractV2",
    period: { kind: "daily", label: "2026-08-10", start: evidence.window.start, end: evidence.window.end },
    workItems: [{ id: "W1", action: "完成实现", result: "形成可验收结果", impact: "降低交付风险", status: "done", evidenceIds: ["E1"] }],
    improvementFindings: [], priorCommitments: [], commitments: [], employeeDispositions: [], tlVerification: [], advisorRuns: [], dataGaps: [],
  };
  writeFileSync(contractPath, JSON.stringify(contract));
  writeFileSync(evidencePath, JSON.stringify(evidence));
  const argv = ["--date", "2026-08-10", "--contract", contractPath, "--evidence", evidencePath];
  try {
    const prepared = await executeReportCommand({ kind: "daily", action: "prepare", argv, env: { HOME: home } });
    assert.equal(prepared.schema, "WorkReportContractV2");
    const saved = await executeReportCommand({ kind: "daily", action: "save", argv, env: { HOME: home } });
    assert.equal(typeof saved.ledgerPath, "string");
    assert.equal(saved.path.endsWith("2026-08-10.md"), true);
    await assert.rejects(
      executeReportCommand({ kind: "weekly", action: "prepare", argv: ["--week", "2026-W33", "--contract", contractPath, "--evidence", evidencePath], env: { HOME: home } }),
      /period does not match/u,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

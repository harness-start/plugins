import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createDeliverRun } from "../scripts/lib/run-io.mjs";
import { gateRun, gateSessionStop } from "../scripts/lib/gate.mjs";
import { listOpenRuns } from "../scripts/lib/scan.mjs";
import { buildReceipt, writeReceipt } from "../scripts/lib/receipt.mjs";
import { renderActiveMarkdown } from "../scripts/lib/active.mjs";
import { tryCompleteRun } from "../scripts/lib/complete.mjs";
import { stagesDir } from "../scripts/lib/paths.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../scripts/pcf-cli.mjs");

function writeIntent(ws, runId) {
  writeFileSync(
    join(stagesDir(ws, runId), "01-intent.md"),
    ["# 意图", "## 非目标", "无", "## 成功标准", "- [x] ok"].join("\n"),
  );
}

function writePlan(ws, runId) {
  writeFileSync(
    join(stagesDir(ws, runId), "02-plan.md"),
    [
      "# 计划",
      "## 涉及文件",
      "- a.js",
      "## 验证",
      "npm test",
      "## 回滚",
      "git revert",
    ].join("\n"),
  );
}

describe("begin + gate + stop isolation", () => {
  let root;
  let claudeHome;
  let ws;
  const sessionA = "test-session-aaa";
  const sessionB = "test-session-bbb";

  before(() => {
    root = mkdtempSync(join(tmpdir(), "pcf-bg-"));
    claudeHome = join(root, "claude-home");
    ws = join(root, "workspace");
    mkdirSync(join(claudeHome, "session-env", sessionA), { recursive: true });
    mkdirSync(join(claudeHome, "session-env", sessionB), { recursive: true });
    mkdirSync(ws, { recursive: true });
    // git root optional
    try {
      execFileSync("git", ["init"], { cwd: ws, stdio: "ignore" });
    } catch {
      /* ok */
    }
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    // wipe runs between tests
    const pcf = join(ws, ".process-confidence");
    if (existsSync(pcf)) rmSync(pcf, { recursive: true, force: true });
  });

  it("begin without sessionId fails via CLI", () => {
    let code = 0;
    try {
      execFileSync(process.execPath, [CLI, "begin", "--title", "x"], {
        cwd: ws,
        env: { ...process.env, CLAUDE_HOME: claudeHome },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      code = e.status;
    }
    assert.notEqual(code, 0);
  });

  it("begin rejects unknown sessionId", () => {
    let stderr = "";
    let code = 0;
    try {
      execFileSync(
        process.execPath,
        [CLI, "begin", "--session-id", "no-such", "--title", "t", "--cwd", ws],
        {
          cwd: ws,
          env: { ...process.env, CLAUDE_HOME: claudeHome, CODEX_HOME: join(root, "empty-codex") },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (e) {
      code = e.status;
      stderr = e.stderr || "";
    }
    assert.notEqual(code, 0);
    assert.match(stderr, /session-not-found-in-registry/);
  });

  it("begin allows valid session and creates templates", () => {
    const out = execFileSync(
      process.execPath,
      [
        CLI,
        "begin",
        "--session-id",
        sessionA,
        "--title",
        "登录限流",
        "--cwd",
        ws,
      ],
      {
        cwd: ws,
        env: {
          ...process.env,
          CLAUDE_HOME: claudeHome,
          CODEX_HOME: join(root, "empty-codex"),
        },
        encoding: "utf8",
      },
    );
    const json = JSON.parse(out);
    assert.equal(json.ok, true);
    assert.ok(json.runId.startsWith("run-"));
    assert.ok(
      existsSync(join(ws, ".process-confidence", "runs", json.runId, "stages", "01-intent.md")),
    );
    assert.ok(existsSync(join(ws, ".process-confidence", "ACTIVE.md")));
    const active = readFileSync(
      join(ws, ".process-confidence", "ACTIVE.md"),
      "utf8",
    );
    assert.match(active, /登录限流/);
    assert.doesNotMatch(active, new RegExp(sessionA));
  });

  it("gateRun false until anchors + receipt; then complete", () => {
    const run = createDeliverRun(ws, {
      sessionId: sessionA,
      title: "feat",
      agent: "claude",
    });

    // Strip template anchors to prove gate requires them.
    writeFileSync(join(stagesDir(ws, run.runId), "01-intent.md"), "# 意图\n");
    writeFileSync(join(stagesDir(ws, run.runId), "02-plan.md"), "# 计划\n");

    let g = gateRun(ws, run);
    assert.equal(g.ok, false);
    assert.ok(g.blockers.includes("missing-intent-anchors"));
    assert.ok(g.blockers.includes("missing-plan-anchors"));

    writeIntent(ws, run.runId);
    writePlan(ws, run.runId);
    const open = listOpenRuns(ws, { sessionId: sessionA })[0];
    g = gateRun(ws, open);
    assert.equal(g.ok, false);
    assert.ok(g.blockers.includes("missing-receipt"));

    const receipt = buildReceipt({
      runId: open.runId,
      sessionId: sessionA,
      command: "npm test",
      exitCode: 0,
      issuer: "pcf-hook",
    });
    writeReceipt(ws, receipt);
    g = gateRun(ws, open);
    assert.equal(g.ok, true);

    const done = tryCompleteRun(ws, open, { minSeverity: "pass" });
    assert.equal(done.completed, true);
    assert.ok(
      existsSync(join(ws, "docs", "process-evidence", `${open.runId}.md`)),
    );
    assert.equal(listOpenRuns(ws, { sessionId: sessionA }).length, 0);
  });

  it("default templates already include stage anchors after begin", () => {
    const run = createDeliverRun(ws, {
      sessionId: sessionA,
      title: "templated",
      agent: "claude",
    });
    const g = gateRun(ws, run);
    assert.equal(g.ok, false);
    assert.deepEqual(g.blockers, ["missing-receipt"]);
  });

  it("Stop isolates sessions", () => {
    const runA = createDeliverRun(ws, {
      sessionId: sessionA,
      title: "A",
      agent: "claude",
    });
    createDeliverRun(ws, {
      sessionId: sessionB,
      title: "B",
      agent: "claude",
    });

    const stopA = gateSessionStop(ws, sessionA, {
      orphanWork: false,
      orphanWorkStop: "on",
    });
    assert.equal(stopA.allow, false);
    assert.equal(stopA.flows.length, 1);
    assert.equal(stopA.flows[0].runId, runA.runId);

    const stopB = gateSessionStop(ws, sessionB, {
      orphanWork: false,
      orphanWorkStop: "on",
    });
    assert.equal(stopB.allow, false);
    assert.equal(stopB.flows.length, 1);
    assert.notEqual(stopB.flows[0].runId, runA.runId);
  });

  it("orphan-work blocks stop without open run", () => {
    const g = gateSessionStop(ws, sessionA, {
      orphanWork: true,
      orphanWorkStop: "on",
    });
    assert.equal(g.allow, false);
    assert.equal(g.reason, "orphan-work");
  });

  it("ACTIVE hides sessionId by default", () => {
    createDeliverRun(ws, {
      sessionId: sessionA,
      title: "HideMe",
      agent: "claude",
    });
    const md = renderActiveMarkdown(ws, {
      showSessionIdInActive: false,
      activeMaxRunsListed: 20,
      minSeverity: "pass",
    });
    assert.match(md, /HideMe/);
    assert.doesNotMatch(md, new RegExp(sessionA));
  });

  it("hooks never create runs: post-tool script leaves run count", () => {
    const before = listOpenRuns(ws).length;
    const hook = join(__dirname, "../scripts/pcf-hook-post-tool.mjs");
    execFileSync(
      process.execPath,
      [hook],
      {
        cwd: ws,
        input: JSON.stringify({
          session_id: sessionA,
          cwd: ws,
          tool_name: "Write",
          tool_input: { file_path: join(ws, "src/app.js") },
        }),
        encoding: "utf8",
        env: { ...process.env, CLAUDE_HOME: claudeHome },
      },
    );
    assert.equal(listOpenRuns(ws).length, before);
  });
});


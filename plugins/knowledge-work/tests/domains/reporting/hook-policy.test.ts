import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  officialScriptTrusted,
  parseOfficialCommand,
  protectionDecision,
} from "../../../src/domains/reporting/lib/hook-policy.js";

test("protectionDecision denies direct report writes and recursive parent deletion", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "work-report-hook-")));
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
  const home = realpathSync(mkdtempSync(join(tmpdir(), "work-report-hook-")));
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

test("protectionDecision allows a read-only context-rules search rooted at home", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  try {
    const decision = await protectionDecision({
      cwd: home,
      tool_name: "exec_command",
      tool_input: {
        cmd: `find ${home} -type f -name '*context-rules*' -exec sed -n '1,20p' {} \\;`,
      },
    }, { home, state: { phase: "idle" } });
    assert.equal(decision.deny, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("protectionDecision denies a quoted absolute mutation executable", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  try {
    const target = join(home, ".ai-experts", "daily-reports", "2026-08-10.md");
    const decision = await protectionDecision({
      cwd: home,
      tool_name: "exec_command",
      tool_input: { cmd: `"/bin/rm" -f "${target}"` },
    }, { home, state: { phase: "idle" } });
    assert.equal(decision.deny, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("protectionDecision distinguishes search text from a mutating find action", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-report-hook-"));
  try {
    const search = await protectionDecision({
      cwd: home,
      tool_name: "exec_command",
      tool_input: { cmd: `rg -n 'rm|.ai-experts|a > b' ${home}` },
    }, { home, state: { phase: "idle" } });
    assert.equal(search.deny, false);

    const redirectedSearch = await protectionDecision({
      cwd: home,
      tool_name: "exec_command",
      tool_input: { cmd: `find .ai-experts -type f -print 2>/dev/null | rg 'commit.*scope'` },
    }, { home, state: { phase: "idle" } });
    assert.equal(redirectedSearch.deny, false);

    const mutation = await protectionDecision({
      cwd: home,
      tool_name: "exec_command",
      tool_input: { cmd: `find ${home} -type f -exec rm -f {} \\;` },
    }, { home, state: { phase: "idle" } });
    assert.equal(mutation.deny, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
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
  const parsed = parseOfficialCommand('PLUGIN_ROOT=/tmp node "${PLUGIN_ROOT}/dist/cli/harness.mjs" report daily-save --date 2026-08-10 --input /tmp/draft.md');
  assert.match(parsed?.error ?? "", /must not be overridden/u);
});

test("parseOfficialCommand reserves only the unified owner CLI", () => {
  const unified = parseOfficialCommand("node /plugin/dist/cli/harness.mjs report daily-prepare --date 2026-08-10 --input /tmp/draft.md");
  assert.equal(unified && !("error" in unified) ? unified.action : null, "prepare");
  assert.equal(parseOfficialCommand("node /plugin/dist/cli/daily-work-report-prepare.mjs --date 2026-08-10 --input /tmp/draft.md"), null);
});

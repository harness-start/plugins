import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, resolveConfig } from "../scripts/lib/config.mjs";
import {
  extractLedgerObject,
  loadAndValidateLedger,
  validateLedger,
} from "../scripts/lib/ledger.mjs";
import {
  actionablePrompt,
  applyClassification,
  classifyUserInput,
  extractShellMutationTargets,
  isExpired,
  isLedgerArtifactPath,
  isLedgerPath,
  isSessionBoundLedger,
  normalizeRelPath,
  looksLikeCompletionClaim,
  looksLikeImplementClaim,
  matchEntry,
  openFromEntry,
  pathMatchesGlob,
  shellLooksMutating,
  shellWriteDecision,
  writeBlockActive,
} from "../scripts/lib/policy.mjs";
import { emptyState } from "../scripts/lib/state-store.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/first-principles-gate.mjs", import.meta.url),
);

function validLedger(overrides = {}) {
  return {
    schema: "first-principles/v1",
    status: "closed",
    question: "Should we add edge caching?",
    default_practice: "Copy Redis from other services",
    assumptions: [
      { id: "A1", claim: "Cache always wins", status: "challenged" },
    ],
    atoms: [
      {
        id: "F1",
        statement: "p95 is 180ms",
        kind: "measurement",
        source: "observed",
      },
      {
        id: "F2",
        statement: "Consistency window <= 5s",
        kind: "constraint",
        source: "given",
      },
    ],
    rebuild: {
      options: [
        {
          id: "O1",
          conclusion: "Instrument hot path first",
          derived_from: ["F1", "F2"],
          rejects: ["A1"],
        },
      ],
    },
    uncertainties: ["Unknown hit rate for the hot path"],
    ...overrides,
  };
}

function workspace(prefix = "fp-gate-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs", "decisions"), { recursive: true });
  writeFileSync(join(root, "src", "app.js"), "export const value = 0;\n");
  return root;
}

function runEntry(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(typeof event === "string" ? event : JSON.stringify(event));
  });
}

function parseStdout(stdout) {
  const line = String(stdout).trim();
  if (!line) return null;
  try {
    return JSON.parse(line.split("\n").filter(Boolean).at(-1));
  } catch {
    return null;
  }
}

function writeLedger(root, ledger = validLedger()) {
  mkdirSync(join(root, ".first-principles"), { recursive: true });
  writeFileSync(
    join(root, ".first-principles", "ledger.json"),
    `${JSON.stringify(ledger)}\n`,
  );
}

// ---------------------------------------------------------------------------
// Pure policy: entry surface must stay narrow
// ---------------------------------------------------------------------------

test("default entry tokens are only /first-principles and $first-principles", () => {
  assert.deepEqual([...DEFAULT_CONFIG.entryTokens], [
    "/first-principles",
    "$first-principles",
  ]);
  assert.ok(!DEFAULT_CONFIG.entryTokens.includes("/fp"));
  assert.ok(!DEFAULT_CONFIG.entryTokens.includes("$fp"));
});

test("matchEntry accepts only configured full tokens as prefix", () => {
  assert.deepEqual(matchEntry("/first-principles 缓存"), {
    token: "/first-principles",
    topic: "缓存",
  });
  assert.deepEqual(matchEntry("$first-principles: auth"), {
    token: "$first-principles",
    topic: "auth",
  });
  assert.ok(matchEntry("/first-principles"));
  assert.ok(matchEntry("$first-principles"));
});

test("matchEntry rejects short aliases and mid-string mentions", () => {
  assert.equal(matchEntry("/fp"), null, "/fp must not open mode");
  assert.equal(matchEntry("/fp 缓存"), null);
  assert.equal(matchEntry("$fp"), null, "$fp must not open mode");
  assert.equal(matchEntry("$fp: auth"), null);
  assert.equal(matchEntry("实现登录，以后再用 /first-principles"), null);
  assert.equal(matchEntry("please /first-principles later"), null);
  assert.equal(matchEntry("first-principles 缓存"), null);
  assert.equal(matchEntry("/first-principles-extra"), null);
  assert.equal(matchEntry("/first-principle 缓存"), null);
});

test("actionablePrompt strips skill and fence noise before entry match", () => {
  const prompt = "<skill>x</skill>\n\n/first-principles topic";
  assert.equal(matchEntry(prompt)?.topic, "topic");
  assert.ok(actionablePrompt("```\n/first-principles\n```\nok").includes("ok"));
  // Fenced-only token must not open (stripped before match)
  assert.equal(matchEntry("```\n/first-principles\n```\n"), null);
});

test("classify: continue, done(完成 only), abort", () => {
  assert.equal(classifyUserInput("补充一个约束：TTL 5m", {}).class, "continue");
  assert.equal(classifyUserInput("完成", {}).class, "done");
  assert.equal(classifyUserInput("完成 台账已写", {}).class, "done");
  assert.equal(classifyUserInput("# first-principles-abort", {}).class, "abort");
  // Invented short done/abort aliases are not protocol by default
  assert.equal(classifyUserInput("fp-done", {}).class, "continue");
  assert.equal(classifyUserInput("# fp-abort", {}).class, "continue");
  assert.equal(classifyUserInput("完成度怎么算", {}).class, "continue");
});

test("ledger path allowlist and write-block phase gate", () => {
  const config = resolveConfig(null);
  assert.equal(isLedgerPath(".first-principles/ledger.json", config), true);
  assert.equal(isLedgerPath("docs/decisions/x.md", config), true);
  assert.equal(isLedgerPath("spec.md", config), true);
  assert.equal(isLedgerPath("src/app.js", config), false);
  assert.equal(
    isLedgerPath(
      "plugins/first-principles-gate/acceptance/x/workspace/.first-principles/ledger.json",
      config,
    ),
    true,
    "nested monorepo workspace path must still allow ledger tree",
  );
  assert.equal(pathMatchesGlob(".first-principles/a.json", ".first-principles/**"), true);
  assert.equal(writeBlockActive("open", config), true);
  assert.equal(writeBlockActive("closed", config), false);
  assert.equal(writeBlockActive("idle", config), false);
});

test("state transitions: entry → continue → done", () => {
  let state = emptyState();
  state = openFromEntry(state, { token: "/first-principles", topic: "x" }, 1000);
  assert.equal(state.phase, "open");
  state = applyClassification(
    state,
    classifyUserInput("继续拆假设", state),
    2000,
  );
  assert.equal(state.phase, "open");
  assert.equal(state.lastUserClass, "continue");
  state = applyClassification(state, classifyUserInput("完成", state), 3000);
  assert.equal(state.phase, "closed");
  assert.equal(state.closeReason, "completed");
});

test("TTL expiry detection", () => {
  const state = {
    phase: "open",
    updatedAt: Date.now() - 48 * 3600_000,
  };
  assert.equal(isExpired(state, 24), true);
  assert.equal(isExpired({ phase: "open", updatedAt: Date.now() }, 24), false);
});

test("shell mutating heuristic", () => {
  assert.equal(shellLooksMutating("cat > src/a.js <<'EOF'\nx\nEOF"), true);
  assert.equal(shellLooksMutating("git status"), false);
  assert.equal(shellLooksMutating("rm -rf src"), true);
});

test("config rejects invalid writeBlock mode and keeps default entries", () => {
  const warnings = [];
  const config = resolveConfig({ writeBlock: { mode: "nope" } }, (m) =>
    warnings.push(m),
  );
  assert.equal(config.writeBlock.mode, DEFAULT_CONFIG.writeBlock.mode);
  assert.ok(warnings.length >= 1);
  assert.deepEqual(config.entryTokens, [...DEFAULT_CONFIG.entryTokens]);
});

// ---------------------------------------------------------------------------
// Ledger schema strictness
// ---------------------------------------------------------------------------

test("validateLedger accepts minimal valid structure", () => {
  const result = validateLedger(validLedger());
  assert.equal(result.valid, true, result.findings.join("; "));
});

test("validateLedger rejects each missing required field class", () => {
  assert.equal(validateLedger({ schema: "first-principles/v1" }).valid, false);

  const noAssumptions = validateLedger(validLedger({ assumptions: [] }));
  assert.equal(noAssumptions.valid, false);
  assert.ok(noAssumptions.findings.some((f) => /assumptions/u.test(f)));

  const noAtoms = validateLedger(validLedger({ atoms: [] }));
  assert.equal(noAtoms.valid, false);
  assert.ok(noAtoms.findings.some((f) => /atoms/u.test(f)));

  const noUncertainties = validateLedger(validLedger({ uncertainties: [] }));
  assert.equal(noUncertainties.valid, false);
  assert.ok(noUncertainties.findings.some((f) => /uncertainties/u.test(f)));

  const noQuestion = validateLedger(validLedger({ question: "", problem: "" }));
  assert.equal(noQuestion.valid, false);
});

test("validateLedger rejects bad derived_from and wrong schema", () => {
  const badRef = validateLedger(
    validLedger({
      rebuild: {
        options: [
          { id: "O1", conclusion: "x", derived_from: ["NOPE"] },
        ],
      },
    }),
  );
  assert.equal(badRef.valid, false);
  assert.ok(badRef.findings.some((f) => /unknown atom id/u.test(f)));

  const badSchema = validateLedger(validLedger({ schema: "first-principles/v0" }));
  assert.equal(badSchema.valid, false);
});

test("extractLedgerObject reads fenced markdown blocks", () => {
  const body = [
    "# notes",
    "```first-principles",
    JSON.stringify(validLedger()),
    "```",
  ].join("\n");
  const extracted = extractLedgerObject(body);
  assert.equal(extracted.ok, true);
  assert.equal(validateLedger(extracted.value).valid, true);
});

test("loadAndValidateLedger reads workspace primary path", () => {
  const root = workspace("fp-ledger-");
  try {
    writeLedger(root);
    const loaded = loadAndValidateLedger(root, resolveConfig(null));
    assert.equal(loaded.present, true);
    assert.equal(loaded.valid, true, loaded.findings.join("; "));
    assert.equal(loaded.relativePath, ".first-principles/ledger.json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("completion and implement claim detectors", () => {
  assert.equal(looksLikeCompletionClaim("第一性原理分析已完成，见 ledger"), true);
  assert.equal(looksLikeCompletionClaim("ledger is complete"), true);
  assert.equal(looksLikeCompletionClaim("我们可以讨论第一性原理方法"), false);
  assert.equal(looksLikeImplementClaim("好的，我开始实现登录模块。"), true);
  assert.equal(looksLikeImplementClaim("下一轮继续列假设"), false);
});

// ---------------------------------------------------------------------------
// Hook integration against shipped entrypoint
// ---------------------------------------------------------------------------

test("hook: open denies business write, allows ledger, complete unlocks with valid ledger", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-integration-1";

  try {
    const entry = await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles 缓存" },
      env,
    );
    assert.equal(entry.code, 0);
    const entryOut = parseStdout(entry.stdout);
    assert.ok(
      entryOut?.hookSpecificOutput?.additionalContext?.includes(
        "first-principles-gate",
      ),
      entry.stdout || entry.stderr,
    );
    assert.match(
      entryOut.hookSpecificOutput.additionalContext,
      /业务写入已拦截/,
    );

    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "export const value = 1;\n",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(deny.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      deny.stdout || deny.stderr,
    );

    const allowLedger = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, ".first-principles", "ledger.json"),
          content: `${JSON.stringify(validLedger())}\n`,
        },
      },
      env,
    );
    assert.equal(parseStdout(allowLedger.stdout), null);
    writeLedger(root);

    const done = await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "完成" },
      env,
    );
    assert.match(
      parseStdout(done.stdout)?.hookSpecificOutput?.additionalContext ?? "",
      /写屏障已解除|会话已结束/,
    );

    const stopOk = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "第一性原理分析已完成，ledger 已落盘。",
      },
      env,
    );
    assert.equal(
      parseStdout(stopOk.stdout),
      null,
      "valid ledger + closed should not block",
    );

    const allowWrite = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "export const value = 2;\n",
        },
      },
      env,
    );
    assert.equal(parseStdout(allowWrite.stdout), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: /fp and $fp never open write-block", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  try {
    for (const [session, prompt] of [
      ["s-fp-slash", "/fp 缓存"],
      ["s-fp-dollar", "$fp: auth"],
      ["s-fp-only", "/fp"],
    ]) {
      const entry = await runEntry(
        "prompt",
        { cwd: root, session_id: session, prompt },
        env,
      );
      assert.equal(
        parseStdout(entry.stdout),
        null,
        `short alias must not inject protocol: ${prompt}`,
      );
      const pre = await runEntry(
        "pre",
        {
          cwd: root,
          session_id: session,
          tool_name: "Write",
          tool_input: {
            file_path: join(root, "src", "app.js"),
            content: "x\n",
          },
        },
        env,
      );
      assert.equal(
        parseStdout(pre.stdout),
        null,
        `short alias must not lock writes: ${prompt}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: completion claim without ledger is blocked", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-claim-block";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "第一性原理分析已完成。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(out?.decision, "block", stop.stdout || stop.stderr);
    assert.match(out?.reason ?? "", /first-principles-gate|ledger/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: invalid ledger (bad derived_from) blocks completion claim", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-bad-ledger";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    writeLedger(
      root,
      validLedger({
        rebuild: {
          options: [
            { id: "O1", conclusion: "x", derived_from: ["MISSING"] },
          ],
        },
      }),
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "第一性原理分析已完成。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(out?.decision, "block");
    assert.match(out?.reason ?? "", /unknown atom id|ledger/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: incomplete open turn soft-reports instead of permanent lock", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-soft";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "正在列假设，下一轮写 atoms。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.notEqual(out?.decision, "block");
    assert.match(
      out?.hookSpecificOutput?.additionalContext ?? "",
      /soft report|尚未完整/u,
    );

    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "x\n",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(deny.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: mid-string first-principles does not open write-block", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  try {
    await runEntry(
      "prompt",
      {
        cwd: root,
        session_id: "s-mid",
        prompt: "实现登录，以后再用 /first-principles",
      },
      env,
    );
    const pre = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: "s-mid",
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "x\n",
        },
      },
      env,
    );
    assert.equal(parseStdout(pre.stdout), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: corrupt state file fails open (no permanent write lock)", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-corrupt";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    const pluginDir = join(data, "first-principles-gate");
    for (const name of readdirSync(pluginDir)) {
      writeFileSync(join(pluginDir, name), "{not-json", "utf8");
    }
    const pre = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "ok\n",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(pre.stdout),
      null,
      "corrupt state must fail-open and not deny writes",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: stop blocks implement claim while open", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-impl";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "好的，我开始实现登录模块。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(out?.decision, "block");
    assert.match(out?.reason ?? "", /尚未结束|first-principles-gate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: abort unlocks writes without requiring ledger", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-abort";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    await runEntry(
      "prompt",
      {
        cwd: root,
        session_id: session,
        prompt: "# first-principles-abort",
      },
      env,
    );
    const pre = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "y\n",
        },
      },
      env,
    );
    assert.equal(parseStdout(pre.stdout), null);

    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "已中止。",
      },
      env,
    );
    assert.equal(parseStdout(stop.stdout)?.decision, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: closed completed without valid ledger is blocked on stop", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-closed-invalid";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "完成" },
      env,
    );
    const allow = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          content: "z\n",
        },
      },
      env,
    );
    assert.equal(parseStdout(allow.stdout), null);

    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "会话结束了。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(out?.decision, "block");
    assert.match(out?.reason ?? "", /ledger/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: mutating shell denied while open; read-only shell allowed", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-shell";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    const denyShell = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: { command: "rm -rf src" },
      },
      env,
    );
    assert.equal(
      parseStdout(denyShell.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
    );

    const allowShell = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: { command: "git status" },
      },
      env,
    );
    assert.equal(parseStdout(allowShell.stdout), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: dollar entry token opens and locks writes", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-dollar";
  try {
    const entry = await runEntry(
      "prompt",
      {
        cwd: root,
        session_id: session,
        prompt: "$first-principles auth cache",
      },
      env,
    );
    assert.match(
      parseStdout(entry.stdout)?.hookSpecificOutput?.additionalContext ?? "",
      /first-principles-gate/,
    );
    const deny = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Edit",
        tool_input: {
          file_path: join(root, "src", "app.js"),
          old_string: "0",
          new_string: "1",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(deny.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Audit fixes: stale ledger, path-aware shell, primary path, report mode
// ---------------------------------------------------------------------------

test("extractShellMutationTargets and path-aware shellWriteDecision", () => {
  const config = resolveConfig(null);
  assert.deepEqual(
    extractShellMutationTargets("python3 -c \"open('src/app.js','w').write('x')\""),
    ["src/app.js"],
  );
  assert.ok(
    extractShellMutationTargets("mkdir -p .first-principles").includes(
      ".first-principles",
    ),
  );

  const denyBiz = shellWriteDecision(
    "python3 -c \"open('src/app.js','w').write('x')\"",
    config,
    (t) => t,
  );
  assert.equal(denyBiz.deny, true);
  assert.ok(denyBiz.reasons.some((r) => /src\/app\.js/u.test(r)));

  const allowLedger = shellWriteDecision(
    "mkdir -p .first-principles",
    config,
    (t) => t,
  );
  assert.equal(allowLedger.deny, false, allowLedger.reasons.join("; "));

  const failClosed = shellWriteDecision("npm install lodash", config, (t) => t);
  assert.equal(failClosed.deny, true);
  assert.match(failClosed.reasons.join(" "), /without resolvable path/u);

  // Additional bypass candidates that must fail-closed or deny business paths.
  const denyPathlib = shellWriteDecision(
    "python3 -c \"from pathlib import Path; Path('src/a.js').write_text('x')\"",
    config,
    (t) => t,
  );
  assert.equal(denyPathlib.deny, true, "pathlib write_text must be denied");

  const denyDd = shellWriteDecision(
    "dd if=/dev/zero of=src/a.js bs=1 count=1",
    config,
    (t) => t,
  );
  assert.equal(denyDd.deny, true, "dd of= business path must be denied");

  const denyRuby = shellWriteDecision(
    "ruby -e \"File.write('src/a.js','x')\"",
    config,
    (t) => t,
  );
  assert.equal(denyRuby.deny, true, "ruby File.write must be denied");
});

test("normalizeRelPath collapses .. so allowlist cannot be traversed", () => {
  const config = resolveConfig(null);
  assert.equal(normalizeRelPath("docs/decisions/../../src/app.js"), "src/app.js");
  assert.equal(isLedgerPath("docs/decisions/../../src/app.js", config), false);
  assert.equal(isLedgerArtifactPath(".first-principles", config), false);
  assert.equal(isLedgerArtifactPath(".first-principles/ledger.json", config), true);
});

test("isLedgerPath includes configured primaryRelativePath", () => {
  const config = resolveConfig({
    ledger: { primaryRelativePath: "analysis/ledger.json" },
    writeBlock: { ledgerAllow: [".first-principles/**"] },
  });
  assert.equal(isLedgerPath("analysis/ledger.json", config), true);
  assert.equal(isLedgerPath("analysis", config), true);
  assert.equal(isLedgerPath("analysis/notes.md", config), true);
  assert.equal(isLedgerPath("src/app.js", config), false);
});

test("isSessionBoundLedger requires mtime or revision after enter", () => {
  const enteredAt = Date.now();
  assert.equal(
    isSessionBoundLedger(
      { valid: true, mtimeMs: enteredAt - 60_000 },
      { enteredAt, ledgerRevision: 0 },
    ),
    false,
  );
  assert.equal(
    isSessionBoundLedger(
      { valid: true, mtimeMs: enteredAt + 10 },
      { enteredAt, ledgerRevision: 0 },
    ),
    true,
  );
  assert.equal(
    isSessionBoundLedger(
      { valid: true, mtimeMs: enteredAt - 60_000 },
      { enteredAt, ledgerRevision: 1 },
    ),
    true,
  );
});

test("hook: stale pre-existing valid ledger cannot satisfy completion claim", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-stale-ledger";
  try {
    writeLedger(root);
    const ledgerPath = join(root, ".first-principles", "ledger.json");
    const old = new Date(Date.now() - 3600_000);
    utimesSync(ledgerPath, old, old);

    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles stale" },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "第一性原理分析已完成。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(out?.decision, "block", stop.stdout || stop.stderr);
    assert.match(out?.reason ?? "", /stale|session/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: mkdir-only PostToolUse must not credit stale ledger revision", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-mkdir-no-credit";
  try {
    writeLedger(root);
    const ledgerPath = join(root, ".first-principles", "ledger.json");
    const old = new Date(Date.now() - 3600_000);
    utimesSync(ledgerPath, old, old);

    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles mkdir-credit" },
      env,
    );
    // Previously this incorrectly bumped ledgerRevision and unbound stale ledgers.
    await runEntry(
      "post",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: { command: "mkdir -p .first-principles" },
      },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "第一性原理分析已完成。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.equal(
      out?.decision,
      "block",
      `mkdir must not bind stale ledger: ${stop.stdout || stop.stderr}`,
    );
    assert.match(out?.reason ?? "", /stale|session|ledger/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: python open write to business path denied; mkdir ledger allowed", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-shell-path";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles shell" },
      env,
    );
    const denyPy = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: {
          command: "python3 -c \"open('src/app.js','w').write('x')\"",
        },
      },
      env,
    );
    assert.equal(
      parseStdout(denyPy.stdout)?.hookSpecificOutput?.permissionDecision,
      "deny",
      denyPy.stdout || denyPy.stderr,
    );

    const allowMkdir = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Bash",
        tool_input: { command: "mkdir -p .first-principles" },
      },
      env,
    );
    assert.equal(
      parseStdout(allowMkdir.stdout),
      null,
      allowMkdir.stdout || allowMkdir.stderr,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: stopGate.mode=report emits context for implement claim instead of block", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  writeFileSync(
    join(root, ".first-principles-gate.mjs"),
    "export default { stopGate: { mode: 'report', blockImplementWhileOpen: true } };\n",
  );
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-report-impl";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    const stop = await runEntry(
      "stop",
      {
        cwd: root,
        session_id: session,
        last_assistant_message: "好的，我开始实现登录模块。",
      },
      env,
    );
    const out = parseStdout(stop.stdout);
    assert.notEqual(out?.decision, "block");
    assert.match(
      out?.hookSpecificOutput?.additionalContext ?? "",
      /尚未结束|不要开始实现/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("hook: configured primary ledger path is writable while open", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "fp-data-"));
  writeFileSync(
    join(root, ".first-principles-gate.mjs"),
    "export default { ledger: { primaryRelativePath: 'analysis/ledger.json' } };\n",
  );
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  const session = "sess-primary-path";
  try {
    await runEntry(
      "prompt",
      { cwd: root, session_id: session, prompt: "/first-principles x" },
      env,
    );
    mkdirSync(join(root, "analysis"), { recursive: true });
    const allow = await runEntry(
      "pre",
      {
        cwd: root,
        session_id: session,
        tool_name: "Write",
        tool_input: {
          file_path: join(root, "analysis", "ledger.json"),
          content: `${JSON.stringify(validLedger())}\n`,
        },
      },
      env,
    );
    assert.equal(parseStdout(allow.stdout), null, allow.stdout || allow.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});


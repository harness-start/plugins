import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("dispatcher uses fused owner handlers and owner quality entries", () => {
  const root = resolve(import.meta.dirname, "../../../src/entries/hooks");
  const source = readFileSync(resolve(root, "dispatcher.ts"), "utf8");
  assert.match(source, /runOwnerDispatcher/u);
  assert.doesNotMatch(source, /runAioDispatcher/u);
  assert.match(readFileSync(resolve(root, "line-budget-check.ts"), "utf8"), /domains\/quality/u);
  assert.match(readFileSync(resolve(root, "markdown-check.ts"), "utf8"), /domains\/quality/u);
});

test("quality line budgets are routed before and after predictable writes", () => {
  for (const host of ["claude", "codex"]) {
    const routes = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../routes/${host}.json`), "utf8"));
    assert.ok(routes.PreToolUse.some((route) => route.handler === "quality:engineering-quality-pre"), host);
    assert.ok(routes.PostToolUse.some((route) => route.handler === "quality:engineering-quality-post"), host);
    assert.ok(routes.Stop.some((route) => route.handler === "quality:engineering-quality-stop"), host);
  }
});

test("domain checks use one aggregate route for each lifecycle phase", () => {
  for (const host of ["claude", "codex"]) {
    const routes = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../routes/${host}.json`), "utf8"));
    assert.equal(routes.PreToolUse.filter((route: { handler?: string }) => route.handler === "domains:pre-tool").length, 1, host);
    assert.equal(routes.PostToolUse.filter((route: { handler?: string }) => route.handler === "domains:post-tool").length, 1, host);
    assert.equal(routes.Stop.filter((route: { handler?: string }) => route.handler === "domains:stop").length, 1, host);
    assert.equal(routes.PreToolUse.some((route: { handler?: string }) => route.handler?.endsWith(":domain-hook")), false, host);
  }
});

test("owner Stop returns a structured block for unresolved post-write budget debt", () => {
  const owner = resolve(import.meta.dirname, "../../..");
  const cwd = mkdtempSync(join(tmpdir(), "workspace-owner-budget-stop-"));
  const target = join(cwd, "oversized.sh");
  const sessionId = `owner-budget-debt-${process.pid}-${Date.now()}`;
  writeFileSync(target, "# generated line\n".repeat(301));
  const invoke = (eventName: string, event: Record<string, unknown>) => spawnSync(
    process.execPath,
    [resolve(owner, "dist/hooks/dispatcher.mjs"), "codex", eventName],
    {
      cwd,
      env: { ...process.env, PLUGIN_ROOT: owner },
      input: JSON.stringify({ cwd, session_id: sessionId, ...event }),
      encoding: "utf8",
    },
  );

  const post = invoke("PostToolUse", { tool_name: "Bash", tool_input: { command: "generator > oversized.sh" } });
  assert.equal(post.status, 0, post.stderr);
  const stop = invoke("Stop", {});
  assert.equal(stop.status, 0, stop.stderr);
  const output = JSON.parse(stop.stdout);
  assert.equal(output.decision, "block");
  assert.match(output.reason, /file line budget/u);
});

test("owner PreToolUse returns a structured denial for a predictable over-budget write", () => {
  const owner = resolve(import.meta.dirname, "../../..");
  const cwd = mkdtempSync(join(tmpdir(), "workspace-owner-budget-"));
  const target = join(cwd, "src", "limited.ts");
  mkdirSync(join(cwd, "src"));
  const result = spawnSync(process.execPath, [resolve(owner, "dist/hooks/dispatcher.mjs"), "codex", "PreToolUse"], {
    cwd,
    env: { ...process.env, PLUGIN_ROOT: owner },
    input: JSON.stringify({
      cwd,
      tool_name: "Write",
      tool_input: { file_path: target, content: "const value = 1;\n".repeat(501) },
    }),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /file line budget/u);
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import * as aioCli from "../../src/aio-cli.js";
import * as aioDispatcher from "../../src/aio-dispatcher.js";

const root = resolve(import.meta.dirname, "../../..");

test("AIO Hook routes call registered owner handlers in process", async () => {
  assert.equal(typeof aioDispatcher.dispatchHookRoutes, "function");
  const calls: string[] = [];
  const result = await aioDispatcher.dispatchHookRoutes({
    eventName: "PreToolUse",
    host: "codex",
    raw: JSON.stringify({ tool_name: "Bash" }),
    routes: {
      PreToolUse: [
        { handler: "first", args: ["pre"], matcher: "Bash", trigger: "test:first" },
        { handler: "second", args: ["pre"], matcher: "Read" },
      ],
    },
    handlers: {
      first: ({ args, event, trigger }: { args: string[]; event: Record<string, unknown>; trigger: string }) => {
        calls.push(`${args[0]}:${String(event.tool_name)}:${trigger}`);
        return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "owner handler ran" } };
      },
      second: () => { throw new Error("matcher must skip this handler"); },
    },
  });
  assert.deepEqual(calls, ["pre:Bash:test:first"]);
  assert.deepEqual(result, {
    output: { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "owner handler ran" } },
    failures: [],
  });
});

test("AIO CLI routes call registered owner commands in process", async () => {
  assert.equal(typeof aioCli.dispatchCliRoute, "function");
  const calls: string[][] = [];
  const status = await aioCli.dispatchCliRoute({
    argv: ["debug", "resume", "--id", "DBG-1"],
    routes: { debug: { "*": { handler: "debugging", forwardAction: true } } },
    handlers: {
      debugging: (args: string[]) => { calls.push(args); return 0; },
    },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls, [["resume", "--id", "DBG-1"]]);
});

test("artifact owner dispatches a public Hook event to the responsible internal module", () => {
  const workspace = mkdtempSync(join(tmpdir(), "aio-artifact-dispatch-"));
  const pluginRoot = resolve(root, "plugins", "artifact-production");
  try {
    const project = join(workspace, "artifacts", "logo", "demo");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "plan.contract.json"), `${JSON.stringify({ artifactId: "demo", targetStage: "source" })}\n`);
    const result = spawnSync(
      process.execPath,
      [resolve(pluginRoot, "dist/hooks/dispatcher.mjs"), "codex", "PreToolUse"],
      {
        cwd: workspace,
        encoding: "utf8",
        input: JSON.stringify({
          cwd: workspace,
          session_id: "aio-runtime",
          tool_name: "Bash",
          tool_input: {
            command: "node -e \"require('node:fs').writeFileSync('artifacts/logo/demo/dist/forged.svg','x')\"",
          },
        }),
        env: {
          ...process.env,
          PLUGIN_ROOT: pluginRoot,
          PLUGIN_DATA: join(workspace, "plugin-data"),
          AI_EXPERTS_SESSION_ID: "aio-runtime",
          AI_EXPERTS_TRIGGER_FROM: "test:aio-runtime",
          HARNESS_HOST: "codex",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /Logo Project Delivery Guard/u);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("artifact owner exposes the unified resource-action CLI", () => {
  const pluginRoot = resolve(root, "plugins", "artifact-production");
  const result = spawnSync(
    process.execPath,
    [resolve(pluginRoot, "dist/cli/harness.mjs"), "video", "catalog", "search", "orbit"],
    { cwd: root, encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: pluginRoot } },
  );
  assert.equal(result.status, 0, result.stderr);
  const matches = JSON.parse(result.stdout);
  assert.ok(Array.isArray(matches));
  assert.ok(matches.length > 0);
});

test("owner CLI rejects commands outside its fixed protocol", () => {
  const pluginRoot = resolve(root, "plugins", "engineering-workflow");
  const result = spawnSync(
    process.execPath,
    [resolve(pluginRoot, "dist/cli/harness.mjs"), "python", "lint"],
    { cwd: root, encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: pluginRoot } },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unsupported command: python lint/u);
});

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runDomainEngineeringHook, type DomainEngineeringPolicy } from "@harness/core/domain-engineering-hook";
import { invokeOwnerHook, OwnerHookExitError } from "@harness/core/owner-hook-runtime";

const jsonPolicy: DomainEngineeringPolicy = {
  plugin: "test-engineering",
  displayName: "Test Engineering",
  protections: [],
  validators: [{ id: "validJson", enforcement: "deterministic", kind: "json", match: /\.json$/u, mode: "block" }],
};

function event(cwd: string, target: string, sessionId = "domain-debt-session") {
  return { cwd, session_id: sessionId, tool_name: "Write", tool_input: { file_path: target } };
}

async function invoke(policy: DomainEngineeringPolicy, phase: "pre" | "post" | "stop", hookEvent: Record<string, unknown>) {
  return invokeOwnerHook(hookEvent, [], async () => runDomainEngineeringHook(policy, phase));
}

test("deterministic post failures create debt that clean reruns and deletes clear", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "domain-debt-"));
  const data = mkdtempSync(join(tmpdir(), "domain-data-"));
  const target = join(cwd, "invalid.json");
  const priorData = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = data;
  try {
    writeFileSync(target, "{");
    await assert.rejects(invoke(jsonPolicy, "post", event(cwd, target)), OwnerHookExitError);
    const blocked = await invoke(jsonPolicy, "stop", { cwd, session_id: "domain-debt-session" });
    assert.equal((blocked[0] as { decision?: string })?.decision, "block");

    writeFileSync(target, "{}\n");
    assert.deepEqual(await invoke(jsonPolicy, "post", event(cwd, target)), []);
    assert.deepEqual(await invoke(jsonPolicy, "stop", { cwd, session_id: "domain-debt-session" }), []);

    writeFileSync(target, "{");
    await assert.rejects(invoke(jsonPolicy, "post", event(cwd, target)), OwnerHookExitError);
    unlinkSync(target);
    assert.deepEqual(await invoke(jsonPolicy, "post", event(cwd, target)), []);
    assert.deepEqual(await invoke(jsonPolicy, "stop", { cwd, session_id: "domain-debt-session" }), []);
  } finally {
    if (priorData === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = priorData;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("debt persistence fails open without identity while the immediate check still fails", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "domain-no-identity-"));
  const target = join(cwd, "invalid.json");
  const priorData = process.env.PLUGIN_DATA;
  delete process.env.PLUGIN_DATA;
  try {
    writeFileSync(target, "{");
    await assert.rejects(invoke(jsonPolicy, "post", event(cwd, target, "")), OwnerHookExitError);
    assert.deepEqual(await invoke(jsonPolicy, "stop", { cwd }), []);
  } finally {
    if (priorData !== undefined) process.env.PLUGIN_DATA = priorData;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Stop revalidates missing tools and allows the active Stop retry", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "domain-missing-tool-"));
  const data = mkdtempSync(join(tmpdir(), "domain-missing-data-"));
  const target = join(cwd, "Feature.swift");
  const policy: DomainEngineeringPolicy = {
    plugin: "missing-engineering",
    displayName: "Missing Engineering",
    protections: [],
    validators: [{ id: "swiftParse", enforcement: "deterministic", kind: "swift", match: /\.swift$/u, mode: "block" }],
  };
  const priorData = process.env.PLUGIN_DATA;
  const priorPath = process.env.PATH;
  process.env.PLUGIN_DATA = data;
  process.env.PATH = cwd;
  try {
    writeFileSync(target, "let value = 1\n");
    await assert.rejects(invoke(policy, "post", event(cwd, target, "missing-session")), OwnerHookExitError);
    assert.deepEqual(await invoke(policy, "stop", { cwd, session_id: "missing-session", stop_hook_active: true }), []);
    const blocked = await invoke(policy, "stop", { cwd, session_id: "missing-session" });
    assert.equal((blocked[0] as { decision?: string })?.decision, "block");
  } finally {
    if (priorData === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = priorData;
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("Codex debt state uses Codex plugin data when both host roots are present", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "domain-host-data-"));
  const codexData = mkdtempSync(join(tmpdir(), "domain-codex-data-"));
  const claudeData = mkdtempSync(join(tmpdir(), "domain-claude-data-"));
  const target = join(cwd, "invalid.json");
  const prior = {
    host: process.env.HARNESS_HOST,
    pluginData: process.env.PLUGIN_DATA,
    claudeData: process.env.CLAUDE_PLUGIN_DATA,
  };
  process.env.HARNESS_HOST = "codex";
  process.env.PLUGIN_DATA = codexData;
  process.env.CLAUDE_PLUGIN_DATA = claudeData;
  try {
    writeFileSync(target, "{");
    await assert.rejects(invoke(jsonPolicy, "post", event(cwd, target, "host-data-session")), OwnerHookExitError);
    assert.equal(existsSync(join(codexData, "domain-engineering-debt")), true);
    assert.equal(existsSync(join(claudeData, "domain-engineering-debt")), false);
  } finally {
    if (prior.host === undefined) delete process.env.HARNESS_HOST; else process.env.HARNESS_HOST = prior.host;
    if (prior.pluginData === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = prior.pluginData;
    if (prior.claudeData === undefined) delete process.env.CLAUDE_PLUGIN_DATA; else process.env.CLAUDE_PLUGIN_DATA = prior.claudeData;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(codexData, { recursive: true, force: true });
    rmSync(claudeData, { recursive: true, force: true });
  }
});

test("outstanding deterministic debt blocks unrelated pre-tool actions but allows direct repair", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "domain-pre-debt-"));
  const data = mkdtempSync(join(tmpdir(), "domain-pre-data-"));
  const target = join(cwd, "invalid.json");
  const other = join(cwd, "other.json");
  const priorData = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = data;
  try {
    writeFileSync(target, "{");
    await assert.rejects(invoke(jsonPolicy, "post", event(cwd, target)), OwnerHookExitError);

    const unrelated = await invoke(jsonPolicy, "pre", {
      cwd,
      session_id: "domain-debt-session",
      tool_name: "Bash",
      tool_input: { command: "true" },
    });
    assert.equal((unrelated[0] as { hookSpecificOutput?: { permissionDecision?: string } })
      ?.hookSpecificOutput?.permissionDecision, "deny");
    assert.match(JSON.stringify(unrelated), /Domain Completion Guard/u);

    assert.deepEqual(await invoke(jsonPolicy, "pre", event(cwd, target)), []);
    const wrongTarget = await invoke(jsonPolicy, "pre", event(cwd, other));
    assert.equal((wrongTarget[0] as { hookSpecificOutput?: { permissionDecision?: string } })
      ?.hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    if (priorData === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = priorData;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

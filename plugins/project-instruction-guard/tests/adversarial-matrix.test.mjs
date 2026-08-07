import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MANAGED_END,
  MANAGED_START,
  inspectProjectInstructions,
  reconcileProjectInstructions,
} from "../scripts/lib/project-instructions.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/project-instruction-guard.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../scripts/project-instructions-cli.mjs", import.meta.url));

const CASES = [
  ["canonical", "none", "absent", "block", false],
  ["canonical", "file-tool", "valid-current", "report", true],
  ["missing", "none", "stale", "off", true],
  ["missing", "file-tool", "forged-digest", "invalid-config", false],
  ["malformed-markers", "shell-read", "absent", "invalid-config", true],
  ["malformed-markers", "shell-write", "stale", "report", false],
  ["noncanonical-symlink", "shell-read", "sessionless", "off", false],
  ["noncanonical-symlink", "shell-write", "forged-digest", "block", true],
  ["canonical", "shell-write", "sessionless", "invalid-config", true],
  ["malformed-markers", "file-tool", "sessionless", "block", false],
  ["canonical", "shell-read", "valid-current", "block", false],
  ["missing", "none", "sessionless", "report", false],
  ["missing", "shell-write", "absent", "off", false],
  ["malformed-markers", "none", "forged-digest", "off", false],
  ["noncanonical-symlink", "none", "stale", "invalid-config", false],
  ["noncanonical-symlink", "file-tool", "absent", "report", false],
  ["canonical", "file-tool", "stale", "off", false],
  ["canonical", "shell-read", "forged-digest", "report", false],
  ["missing", "shell-read", "stale", "block", false],
  ["canonical", "none", "valid-current", "off", false],
  ["canonical", "shell-write", "valid-current", "invalid-config", false],
];

function repository(layout) {
  const root = mkdtempSync(join(tmpdir(), "project-instruction-matrix-"));
  execFileSync("git", ["init", "-q", root]);
  if (layout === "canonical") {
    const state = inspectProjectInstructions(root);
    reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest });
  } else if (layout === "malformed-markers") {
    writeFileSync(join(root, "AGENTS.md"), `${MANAGED_START}\n${MANAGED_START}\n${MANAGED_END}\n`);
    symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  } else if (layout === "noncanonical-symlink") {
    writeFileSync(join(root, "README.md"), "# Project\n");
    symlinkSync("./README.md", join(root, "AGENTS.md"));
  }
  return root;
}

function runHook(mode, event, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function event(root, additions = {}) {
  return { cwd: root, session_id: "matrix-session", ...additions };
}

function receipt(root, kind) {
  const state = inspectProjectInstructions(root);
  const observedAt = kind === "stale" ? "2000-01-01T00:00:00.000Z" : new Date().toISOString();
  const result = { ok: true, decision: "no-change", stateDigest: state.stateDigest, findings: [], state };
  const value = {
    schema: "project-instruction-receipt/v1",
    toolId: "project-instructions-verify",
    invocationId: "matrix-receipt",
    ok: true,
    observedAt,
    provenance: {
      triggerFrom: "test",
      sessionPresent: kind !== "sessionless",
      sessionDigest: createHash("sha256").update(JSON.stringify("matrix-session")).digest("hex"),
    },
    result,
  };
  value.observationDigest = createHash("sha256")
    .update(JSON.stringify({
      toolId: value.toolId,
      invocationId: value.invocationId,
      observedAt,
      provenance: value.provenance,
      result,
    }))
    .digest("hex");
  if (kind === "forged-digest") value.observationDigest = "0".repeat(64);
  return JSON.stringify(value);
}

function expectedBlock(layout, mutation, receiptKind, mode, stopRetry) {
  if (mode === "off" || mode === "report" || stopRetry) return false;
  if (layout !== "canonical") return true;
  const dirty = mutation === "file-tool" || mutation === "shell-write";
  return dirty && receiptKind !== "valid-current";
}

test("pairwise layout, mutation, receipt, mode, and Stop retry matrix stays closed", async (context) => {
  const cleanup = [];
  context.after(() => cleanup.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

  for (const [index, values] of CASES.entries()) {
    const [layout, mutation, receiptKind, mode, stopRetry] = values;
    const root = repository(layout);
    const data = mkdtempSync(join(tmpdir(), "project-instruction-matrix-data-"));
    cleanup.push(root, data);
    if (mode === "report" || mode === "off") {
      writeFileSync(join(root, ".project-instruction-guard.mjs"), `export default { mode: ${JSON.stringify(mode)} };\n`);
    } else if (mode === "invalid-config") {
      writeFileSync(join(root, ".project-instruction-guard.mjs"), "export default { mode: 'off', bypass: true };\n");
    }
    const env = { PLUGIN_DATA: data };
    if (mutation === "file-tool") {
      await runHook("post", event(root, { tool_name: "Edit", tool_response: { exit_code: 0 } }), env);
    } else if (mutation === "shell-write") {
      await runHook("post", event(root, {
        tool_name: "Bash",
        tool_input: { command: "touch changed.txt" },
        tool_response: { exit_code: 0 },
      }), env);
    } else if (mutation === "shell-read") {
      await runHook("post", event(root, {
        tool_name: "Bash",
        tool_input: { command: "git status --short" },
        tool_response: { exit_code: 0 },
      }), env);
    }
    if (receiptKind !== "absent") {
      await runHook("post", event(root, {
        tool_name: "Bash",
        tool_input: { command: `node "${CLI}" verify --workspace "${root}" --decision no-change` },
        tool_response: { exit_code: 0, output: receipt(root, receiptKind) },
      }), env);
    }
    const result = await runHook("stop", event(root, {
      stop_hook_active: stopRetry,
      last_assistant_message: "DONE",
    }), env);
    const blocked = result.stdout.trim() !== "" && JSON.parse(result.stdout).decision === "block";
    assert.equal(
      blocked,
      expectedBlock(layout, mutation, receiptKind, mode, stopRetry),
      `case ${index + 1}: ${values.join(", ")}`,
    );
  }
});

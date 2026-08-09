import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../scripts/artifact-evidence-guard.mjs", import.meta.url));

function runStop(event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "stop"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("ordinary completion without artifact evidence is a no-op", async () => {
  const result = await runStop({ cwd: process.cwd(), last_assistant_message: "Tests passed." });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("well-formed artifact evidence with a digest mismatch blocks Stop", async (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "artifact-evidence-guard-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  writeFileSync(join(workspace, "result.txt"), "ok\n");
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{ path: "result.txt", bytes: 3, sha256: "0".repeat(64), format: "text" }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).reason, /sha256 does not match/u);
});

test("well-formed artifact evidence matching the workspace allows Stop", async (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "artifact-evidence-guard-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  const content = "ok\n";
  writeFileSync(join(workspace, "result.txt"), content);
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{
        path: "result.txt",
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        format: "text",
      }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("malformed explicit artifact evidence blocks Stop", async () => {
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{ path: "../outside.txt", bytes: 1, sha256: "0".repeat(64), format: "text" }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: process.cwd(), last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).reason, /unsupported segment/u);
});

test("unresolvable workspace blocks explicit artifact evidence", async () => {
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{ path: "result.txt", bytes: 1, sha256: "0".repeat(64), format: "text" }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: "/artifact-evidence-guard/missing", last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).reason, /workspace could not be resolved/u);
});

test("artifact exceeding the bounded verification limit blocks Stop", async (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "artifact-evidence-guard-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  const bytes = 64 * 1024 * 1024 + 1;
  const artifactPath = join(workspace, "oversized.bin");
  writeFileSync(artifactPath, "");
  truncateSync(artifactPath, bytes);
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{ path: "oversized.bin", bytes, sha256: "0".repeat(64), format: "binary" }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).reason, /verification limit/u);
});

test("SVG artifact evidence validates its native format", async (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "artifact-evidence-guard-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  const content = '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n';
  writeFileSync(join(workspace, "logo.svg"), content);
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{
        path: "logo.svg",
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        format: "svg",
      }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

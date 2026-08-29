import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const CASES = [
  ["brand-logo-production", "logo", "brand-logo-production", "logo"],
  ["diagram-production", "diagram", "diagram-production", "diagram"],
  ["music-production", "music", "music-production", "music"],
  ["poster-production", "poster", "poster-production", "poster"],
  ["presentation-production", "presentation", "presentation-production", "pptx"],
  ["print-publication-production", "print", "print-publication-production", "print"],
  ["training-program-design", "training", "training-program-design", "training"],
  ["video-production", "video", "video-production", "video"],
] as const;

const eventName = { pre: "PreToolUse", post: "PostToolUse", stop: "Stop" } as const;

function runHook(entry: string, mode: keyof typeof eventName, event: unknown, env: NodeJS.ProcessEnv = process.env): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry, "codex", eventName[mode]], {
      env: {
        ...env,
        AI_EXPERTS_SESSION_ID: "artifact-shell-contract",
        AI_EXPERTS_TRIGGER_FROM: "test:artifact-shell-contract",
      },
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

for (const [plugin, , , carrier] of CASES) {
  test(`${plugin} ignores an unrelated repo-root interpreter when its artifact project exists`, async () => {
    const workspace = mkdtempSync(join(tmpdir(), `${carrier}-opaque-contract-`));
    const project = join(workspace, "artifacts", carrier, "demo");
    try {
      mkdirSync(project, { recursive: true });
      writeFileSync(join(project, "plan.contract.json"), `${JSON.stringify({ artifactId: "demo", targetStage: "source" })}\n`);
      const entry = resolve("plugins/artifact-production/dist/hooks/dispatcher.mjs");
      const command = "node --input-type=module <<'NODE'\nimport { chromium } from 'playwright';\nconsole.log(chromium);\nNODE";
      const result = await runHook(entry, "pre", {
        cwd: workspace,
        session_id: "artifact-shell-contract",
        tool_name: "Bash",
        tool_input: { command },
      }, { ...process.env, HARNESS_HOST: "codex", PLUGIN_DATA: join(workspace, "plugin-data") });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout, "", `${plugin} must leave unrelated repo-root interpreters outside artifact scope`);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
}

for (const [plugin, , , carrier] of CASES) {
  test(`${plugin} revalidates an artifact touched by the same repo-root session`, async () => {
    const workspace = mkdtempSync(join(tmpdir(), `${carrier}-session-contract-`));
    const project = join(workspace, "artifacts", carrier, "demo");
    const entry = resolve("plugins/artifact-production/dist/hooks/dispatcher.mjs");
    const env = { ...process.env, HARNESS_HOST: "codex", PLUGIN_DATA: join(workspace, "plugin-data") };
    const sessionId = `${carrier}-session-contract`;
    try {
      mkdirSync(project, { recursive: true });
      writeFileSync(join(project, "plan.contract.json"), `${JSON.stringify({ artifactId: "demo", targetStage: "source" })}\n`);
      const post = await runHook(entry, "post", {
        cwd: workspace,
        session_id: sessionId,
        tool_name: "Write",
        tool_input: { file_path: `artifacts/${carrier}/demo/src/changed.txt`, content: "changed" },
      }, env);
      assert.equal(post.code, 0, post.stderr);

      const stopped = await runHook(entry, "stop", { cwd: workspace, session_id: sessionId }, env);
      assert.equal(stopped.code, 0, stopped.stderr);
      assert.notEqual(stopped.stdout, "", `${plugin} must retain same-session artifact engagement`);
      assert.equal(JSON.parse(stopped.stdout).decision, "block");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
}

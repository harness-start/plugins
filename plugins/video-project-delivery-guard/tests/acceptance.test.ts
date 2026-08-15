import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const COMMON = join(REPO, "scripts", "acceptance", "lib", "common.sh");
const EXPECT_HELPERS = join(REPO, "scripts", "acceptance", "lib", "expect-helpers.sh");

function bash(script, env = {}) {
  return spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("acceptance case can declare host-specific successful exit codes", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-accept-exits-"));
  try {
    writeFileSync(join(sandbox, "case.toml"), 'id = "deny"\nallowed_host_exits_codex = [0, 1, 124]\n');

    const result = bash(`. "${COMMON}"; read_case_allowed_host_exits "${sandbox}" codex; host_exit_is_allowed 124 "$(read_case_allowed_host_exits "${sandbox}" codex)"`);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^0 1 124\s*$/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("Codex Stop assertions read the structured hook prompt", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-accept-hook-"));
  try {
    const sessions = join(sandbox, "codex-home", "sessions");
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, "rollout.jsonl"), `${JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: '<hook_prompt>[Video Project Delivery Guard] Project contract violations [PLAN_CONTRACT_MISSING]</hook_prompt>' }],
      },
    })}\n`);
    writeFileSync(join(sandbox, "host.log"), "hook: Stop\nhook: Stop Blocked\n");

    const result = bash(`. "${EXPECT_HELPERS}"; require_hook_prompt_signal 'Video Project Delivery Guard.*PLAN_CONTRACT_MISSING'`, {
      ACCEPT_HOST: "codex",
      ACCEPT_OUT: sandbox,
      ACCEPT_LOG: join(sandbox, "host.log"),
    });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(
  new URL("../scripts/project-capability-governance-hook.mjs", import.meta.url),
);
const RECORDER_ENTRY = fileURLToPath(
  new URL("../scripts/project-capability-recorder.mjs", import.meta.url),
);

function proposal(id, revision = 1) {
  return [
    "---",
    `proposal_id: ${id}`,
    `proposal_revision: ${revision}`,
    "kind: sop",
    "title: Repeatable release verification",
    "status: pending",
    "---",
    "",
    "## Evidence",
    "",
    "- release run A",
    "- release run B",
    "",
    "## Reuse scenarios",
    "",
    "- service release",
    "- library release",
    "",
    "## Acceptance",
    "",
    "- verification command and expected outcome are recorded",
    "",
    "## Counterexample",
    "",
    "- a one-off deployment does not qualify",
    "",
  ].join("\n");
}

function runHook(mode, event, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, "codex"], {
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

function runRecorder(args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [RECORDER_ENTRY, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function output(result) {
  const line = result.stdout.trim();
  return line ? JSON.parse(line.split("\n").at(-1)) : null;
}

function pendingPath(root) {
  return join(root, ".project-capabilities", "inbox", "pending");
}

function addFilePatch(path, content) {
  return [
    "*** Begin Patch",
    `*** Add File: ${path}`,
    ...content.split("\n").map((line) => `+${line}`),
    "*** End Patch",
  ].join("\n");
}

test("Stop emits one human-only non-blocking notice for a new proposal revision", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-stop-"));
  const data = mkdtempSync(join(tmpdir(), "project-capability-data-"));
  const pending = join(root, ".project-capabilities", "inbox", "pending");
  mkdirSync(pending, { recursive: true });
  const proposalPath = join(pending, "pc-release-check.md");
  writeFileSync(proposalPath, proposal("pc-release-check"));
  const event = { cwd: root, session_id: "notice-session" };

  try {
    const first = await runHook("stop", event, { PLUGIN_DATA: data });
    assert.equal(first.code, 0, first.stderr);
    const notice = output(first);
    const message = notice?.systemMessage ?? "";
    assert.match(message, /<project-capability-notice/u);
    assert.match(message, /audience="human"/u);
    assert.match(message, /blocking="false"/u);
    assert.match(message, /ai_action="none"/u);
    assert.match(message, /for a human maintainer only/iu);
    assert.match(message, /not an LLM\/AI task or instruction/iu);
    assert.equal(notice?.decision, undefined);
    assert.equal(notice?.hookSpecificOutput, undefined);

    const repeated = await runHook("stop", event, { PLUGIN_DATA: data });
    assert.equal(repeated.code, 0, repeated.stderr);
    assert.equal(repeated.stdout, "");

    writeFileSync(proposalPath, proposal("pc-release-check").replace("release run B", "release run C"));
    const sameRevision = await runHook("stop", { ...event, session_id: "another-session" }, { PLUGIN_DATA: data });
    assert.equal(sameRevision.stdout, "");

    writeFileSync(proposalPath, proposal("pc-release-check", 2));
    const revised = await runHook("stop", event, { PLUGIN_DATA: data });
    assert.match(output(revised)?.systemMessage ?? "", /1 new capability proposal/iu);
    assert.equal((await runHook("stop", event, { PLUGIN_DATA: data })).stdout, "");

    unlinkSync(proposalPath);
    assert.equal((await runHook("stop", event, { PLUGIN_DATA: data })).stdout, "");
    const noticeState = JSON.parse(
      readFileSync(join(root, ".project-capabilities", ".notice-state.json"), "utf8"),
    );
    assert.deepEqual(noticeState.notified, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("only one bound recorder subagent per prompt epoch may create proposals", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-recorder-"));
  const data = mkdtempSync(join(tmpdir(), "project-capability-data-"));
  const env = { PLUGIN_DATA: data };
  const base = { cwd: root, session_id: "recorder-session" };
  const prompt = "PROJECT_CAPABILITY_RECORDER batch-release\nRecord qualified project capabilities only.";
  const target = join(
    root,
    ".project-capabilities",
    "inbox",
    "pending",
    "pc-release-check.md",
  );

  try {
    const session = await runHook("session", base, env);
    assert.match(
      output(session)?.hookSpecificOutput?.additionalContext ?? "",
      /PROJECT_CAPABILITY_RECORDER/u,
    );

    await runHook("prompt", { ...base, prompt: "Implement the release fix" }, env);
    const dispatch = await runHook("pre", {
      ...base,
      tool_name: "spawn_agent",
      tool_input: { task_name: "capability_recorder", message: prompt },
    }, env);
    assert.equal(output(dispatch), null, dispatch.stdout || dispatch.stderr);

    const duplicateDispatch = await runHook("pre", {
      ...base,
      tool_name: "spawn_agent",
      tool_input: { task_name: "second_recorder", message: prompt.replace("batch-release", "batch-second") },
    }, env);
    assert.equal(
      output(duplicateDispatch)?.hookSpecificOutput?.permissionDecision,
      "deny",
    );

    await runHook("start", {
      ...base,
      agent_id: "agent-recorder-1",
      agent_prompt: prompt,
    }, env);

    const mainWrite = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: { file_path: target, content: proposal("pc-release-check") },
    }, env);
    assert.equal(output(mainWrite)?.hookSpecificOutput?.permissionDecision, "deny");

    const recorderWrite = await runHook("pre", {
      ...base,
      agent_id: "agent-recorder-1",
      tool_name: "Write",
      tool_input: { file_path: target, content: proposal("pc-release-check") },
    }, env);
    assert.equal(output(recorderWrite), null, recorderWrite.stdout || recorderWrite.stderr);

    const unboundWrite = await runHook("pre", {
      ...base,
      agent_id: "agent-other",
      tool_name: "Write",
      tool_input: { file_path: target, content: proposal("pc-release-check") },
    }, env);
    assert.equal(output(unboundWrite)?.hookSpecificOutput?.permissionDecision, "deny");

    const invalid = await runHook("pre", {
      ...base,
      agent_id: "agent-recorder-1",
      tool_name: "Write",
      tool_input: {
        file_path: join(pendingPath(root), "pc-one-off.md"),
        content: proposal("pc-one-off").replace("- release run B\n", ""),
      },
    }, env);
    assert.equal(output(invalid)?.hookSpecificOutput?.permissionDecision, "deny");

    for (const id of ["pc-second", "pc-third"]) {
      const accepted = await runHook("pre", {
        ...base,
        agent_id: "agent-recorder-1",
        tool_name: "Write",
        tool_input: { file_path: join(pendingPath(root), `${id}.md`), content: proposal(id) },
      }, env);
      assert.equal(output(accepted), null, accepted.stdout || accepted.stderr);
    }
    const fourth = await runHook("pre", {
      ...base,
      agent_id: "agent-recorder-1",
      tool_name: "Write",
      tool_input: {
        file_path: join(pendingPath(root), "pc-fourth.md"),
        content: proposal("pc-fourth"),
      },
    }, env);
    assert.equal(output(fourth)?.hookSpecificOutput?.permissionDecision, "deny");

    await runHook("prompt", { ...base, prompt: "Continue ordinary work" }, env);
    const nextEpoch = await runHook("pre", {
      ...base,
      tool_name: "spawn_agent",
      tool_input: {
        task_name: "next_capability_recorder",
        message: prompt.replace("batch-release", "batch-next"),
      },
    }, env);
    assert.equal(output(nextEpoch), null, nextEpoch.stdout || nextEpoch.stderr);
    assert.equal(
      readFileSync(join(root, ".project-capabilities", ".gitignore"), "utf8"),
      "*\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("Codex lifecycle consumes an explicit reservation without a dispatch PreToolUse event", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-codex-start-"));
  const decoyData = mkdtempSync(join(tmpdir(), "project-capability-data-"));
  const codexHome = mkdtempSync(join(tmpdir(), "project-capability-codex-home-"));
  const hookData = join(
    codexHome,
    "plugins",
    "data",
    "project-capability-governance-harness-start",
  );
  const recorderEnv = { CODEX_HOME: codexHome, PLUGIN_DATA: decoyData };
  const hookEnv = { PLUGIN_DATA: hookData };
  const base = { cwd: root, session_id: "codex-recorder-session" };
  const secondPrompt = "PROJECT_CAPABILITY_RECORDER batch-second\nRecord qualified project capabilities only.";
  const target = join(pendingPath(root), "pc-codex-release.md");
  const request = "Create pc-codex-release.md as the requested repeatable release-check SOP proposal.";

  try {
    const session = await runHook("session", base, hookEnv);
    assert.match(
      output(session)?.hookSpecificOutput?.additionalContext ?? "",
      /reserve --cwd "\$PWD" --batch "<batch-id>" --request/u,
    );
    assert.doesNotMatch(
      output(session)?.hookSpecificOutput?.additionalContext ?? "",
      /--data-root/u,
    );
    await runHook("prompt", { ...base, prompt: "Standardize the release check" }, hookEnv);

    const reservationCommand = `node '${RECORDER_ENTRY}' reserve --cwd "$PWD" --batch "batch-codex" --request "Create .project-capabilities/inbox/pending/pc-codex-release.md\nInclude the complete proposal contract."`;
    const allowedReservation = await runHook("pre", {
      ...base,
      tool_name: "exec_command",
      tool_input: { cmd: reservationCommand, workdir: root },
    }, hookEnv);
    assert.equal(output(allowedReservation), null, allowedReservation.stdout || allowedReservation.stderr);

    const chainedMutation = await runHook("pre", {
      ...base,
      tool_name: "exec_command",
      tool_input: { cmd: `${reservationCommand}; touch .project-capabilities/inbox/pending/bypass.md`, workdir: root },
    }, hookEnv);
    assert.equal(output(chainedMutation)?.hookSpecificOutput?.permissionDecision, "deny");

    const reserved = await runRecorder([
      "reserve",
      "--cwd", root,
      "--batch", "batch-codex",
      "--session", base.session_id,
      "--request", request,
    ], recorderEnv);
    assert.equal(reserved.code, 0, reserved.stderr);
    assert.deepEqual(JSON.parse(reserved.stdout), {
      ok: true,
      batchId: "batch-codex",
      marker: "PROJECT_CAPABILITY_RECORDER batch-codex",
    });

    const firstStart = await runHook("start", {
      ...base,
      agent_id: "agent-codex-recorder",
    }, hookEnv);
    assert.match(
      output(firstStart)?.hookSpecificOutput?.additionalContext ?? "",
      /dedicated recorder/iu,
    );
    assert.match(
      output(firstStart)?.hookSpecificOutput?.additionalContext ?? "",
      /Create pc-codex-release\.md as the requested repeatable release-check SOP proposal\./u,
    );
    assert.match(
      output(firstStart)?.hookSpecificOutput?.additionalContext ?? "",
      /proposal_revision: 1[\s\S]*explicit_standardization: true[\s\S]*## Evidence[\s\S]*## Reuse scenarios[\s\S]*## Acceptance[\s\S]*## Counterexample/u,
    );
    assert.match(
      output(firstStart)?.hookSpecificOutput?.additionalContext ?? "",
      /at least two dash-prefixed bullet items/iu,
    );
    assert.equal(
      readFileSync(join(root, ".project-capabilities", ".gitignore"), "utf8"),
      "*\n",
    );

    const secondStart = await runHook("start", {
      ...base,
      agent_id: "agent-codex-nested",
      agent_prompt: secondPrompt,
    }, hookEnv);
    assert.match(
      output(secondStart)?.hookSpecificOutput?.additionalContext ?? "",
      /not authorized/iu,
    );

    const acceptedPatch = await runHook("pre", {
      ...base,
      agent_id: "agent-codex-recorder",
      tool_name: "apply_patch",
      tool_input: { patch: addFilePatch(target, proposal("pc-codex-release")) },
    }, hookEnv);
    assert.equal(output(acceptedPatch), null, acceptedPatch.stdout || acceptedPatch.stderr);

    const nestedPatch = await runHook("pre", {
      ...base,
      agent_id: "agent-codex-nested",
      tool_name: "apply_patch",
      tool_input: {
        patch: addFilePatch(
          join(pendingPath(root), "pc-nested.md"),
          proposal("pc-nested"),
        ),
      },
    }, hookEnv);
    assert.equal(output(nestedPatch)?.hookSpecificOutput?.permissionDecision, "deny");

    const malformedPatch = await runHook("pre", {
      ...base,
      agent_id: "agent-codex-recorder",
      tool_name: "apply_patch",
      tool_input: {
        patch: addFilePatch(
          join(pendingPath(root), "pc-invalid.md"),
          proposal("pc-invalid").replace("## Acceptance", "## Validation"),
        ),
      },
    }, hookEnv);
    assert.equal(output(malformedPatch)?.hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(decoyData, { recursive: true, force: true });
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("recorder cannot overwrite an existing proposal or proposal symlink", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-overwrite-"));
  const data = mkdtempSync(join(tmpdir(), "project-capability-data-"));
  const env = { PLUGIN_DATA: data };
  const base = { cwd: root, session_id: "overwrite-session" };
  const prompt = "PROJECT_CAPABILITY_RECORDER batch-overwrite\nRecord qualified project capabilities only.";
  const pending = join(root, ".project-capabilities", "inbox", "pending");

  try {
    await runHook("prompt", { ...base, prompt: "Review the repeated workflow" }, env);
    await runHook("pre", {
      ...base,
      tool_name: "spawn_agent",
      tool_input: { task_name: "capability_recorder", message: prompt },
    }, env);
    await runHook("start", { ...base, agent_id: "agent-overwrite", agent_prompt: prompt }, env);

    const existing = join(pending, "pc-existing.md");
    writeFileSync(existing, proposal("pc-existing"));
    const overwrite = await runHook("pre", {
      ...base,
      agent_id: "agent-overwrite",
      tool_name: "Write",
      tool_input: { file_path: existing, content: proposal("pc-existing") },
    }, env);
    assert.equal(output(overwrite)?.hookSpecificOutput?.permissionDecision, "deny");

    const outside = join(root, "outside.md");
    writeFileSync(outside, "outside\n");
    const link = join(pending, "pc-linked.md");
    symlinkSync(outside, link);
    const symlink = await runHook("pre", {
      ...base,
      agent_id: "agent-overwrite",
      tool_name: "Write",
      tool_input: { file_path: link, content: proposal("pc-linked") },
    }, env);
    assert.equal(output(symlink)?.hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("PreToolUse denies non-canonical descendants and mixed writes under the inbox", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-path-"));
  const data = mkdtempSync(join(tmpdir(), "project-capability-data-"));
  const base = { cwd: root, session_id: "path-session" };
  const nested = join(
    root,
    ".project-capabilities",
    "inbox",
    "pending",
    "nested",
    "pc-hidden.md",
  );

  try {
    const result = await runHook("pre", {
      ...base,
      tool_name: "Write",
      tool_input: { file_path: nested, content: proposal("pc-hidden") },
    }, { PLUGIN_DATA: data });
    assert.equal(output(result)?.hookSpecificOutput?.permissionDecision, "deny");

    const shellFromInbox = await runHook("pre", {
      ...base,
      tool_name: "exec_command",
      tool_input: {
        cmd: "touch pc-shell-bypass.md",
        workdir: join(root, ".project-capabilities", "inbox", "pending"),
      },
    }, { PLUGIN_DATA: data });
    assert.equal(output(shellFromInbox)?.hookSpecificOutput?.permissionDecision, "deny");

    const readOnlyInspection = await runHook("pre", {
      ...base,
      tool_name: "exec_command",
      tool_input: {
        cmd: "find .project-capabilities/inbox -type f -name '*.md' -print",
        workdir: root,
      },
    }, { PLUGIN_DATA: data });
    assert.equal(output(readOnlyInspection), null, readOnlyInspection.stdout || readOnlyInspection.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

test("unbound ordinary SubagentStart does not tell the child to abandon tools", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-ordinary-"));
  const data = mkdtempSync(join(tmpdir(), "project-capability-data-"));
  try {
    await runHook("prompt", {
      cwd: root,
      session_id: "ordinary-session",
      prompt: "Implement the feature",
    }, { PLUGIN_DATA: data });
    const started = await runHook("start", {
      cwd: root,
      session_id: "ordinary-session",
      agent_id: "explore-1",
      agent_prompt: "Explore the repository and report findings.",
    }, { PLUGIN_DATA: data });
    const context = output(started)?.hookSpecificOutput?.additionalContext ?? "";
    assert.doesNotMatch(context, /Do not use tools/u);
    assert.doesNotMatch(context, /not authorized as the recorder/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});

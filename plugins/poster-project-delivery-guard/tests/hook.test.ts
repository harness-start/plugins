import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/hooks/poster-project-delivery-guard.mjs", import.meta.url));

test("Claude and Codex hook manifests both register PostToolUseFailure", () => {
  const claude = JSON.parse(readFileSync(fileURLToPath(new URL("../hooks/claude.json", import.meta.url)), "utf8"));
  const codex = JSON.parse(readFileSync(fileURLToPath(new URL("../hooks/codex.json", import.meta.url)), "utf8"));
  assert.ok(claude.hooks.PostToolUseFailure);
  assert.ok(codex.hooks.PostToolUseFailure);
});

function run(event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("pre hook denies a direct poster proof write", async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-hook-"));
  try {
    const result = await run({ cwd: root, tool_name: "Write", tool_input: { file_path: "artifacts/poster/launch/src/variants/001-main/001-main.abc.png", content: "forged" } });

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook denies a generated write when cwd is the poster project", async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-hook-"));
  const cwd = join(root, "artifacts", "poster", "launch");
  try {
    const result = await run({
      cwd,
      tool_name: "Write",
      tool_input: { file_path: join(cwd, "dist", "launch.main.png"), content: "forged" },
    });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runMode(mode, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("pre hook denies MultiEdit targets listed under edits[]", async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-hook-"));
  try {
    const result = await run({
      cwd: root,
      tool_name: "MultiEdit",
      tool_input: {
        edits: [{
          file_path: "artifacts/poster/launch/dist/launch.main.png",
          old_string: "a",
          new_string: "b",
        }],
      },
    });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const command of [
  "sed -i 's/a/b/' artifacts/poster/launch/dist/launch.main.png",
  "dd if=/dev/null of=artifacts/poster/launch/dist/launch.main.png",
  "sed 'w artifacts/poster/launch/dist/copied.png' artifacts/poster/launch/data/main.json",
  "find artifacts/poster/launch -fprint artifacts/poster/launch/dist/files.txt",
  "find artifacts/poster/launch -fprintf artifacts/poster/launch/dist/files.txt '%p'",
  "rg --pre 'touch artifacts/poster/launch/dist/owned' title artifacts/poster/launch",
  "git diff --output=artifacts/poster/launch/dist/diff.txt",
]) {
  test(`pre hook fails closed for poster shell mutator: ${command.split(" ")[0]}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "poster-shell-"));
    try {
      const result = await run({ cwd: root, tool_name: "Bash", tool_input: { command } });
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("pre hook rejects a node eval command that only mentions the release wrapper", async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-spoof-"));
  try {
    const wrapper = fileURLToPath(new URL("../dist/cli/project-release.mjs", import.meta.url));
    const command = `node -e "require('node:fs').writeFileSync(process.argv[1],'forged')" artifacts/poster/launch/dist/launch.main.png ${wrapper}`;
    const result = await run({ cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const writer of ["project-init.mjs", "project-render.mjs", "project-probe.mjs", "project-review.mjs", "project-release.mjs"]) {
test(`pre hook allows an exact registered ${writer} invocation`, async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-writer-allow-"));
  try {
    mkdirSync(join(root, "artifacts", "poster", "launch"), { recursive: true });
    const wrapper = fileURLToPath(new URL(`../dist/cli/${writer}`, import.meta.url));
    const suffix = writer === "project-init.mjs"
      ? " --profile editorial"
      : writer === "project-review.mjs"
        ? ` ${join(root, "review-input.json")}`
        : "";
    const result = await run({
      cwd: root,
      tool_name: "Bash",
      session_id: "poster-hook-session",
      tool_input: { command: `node ${wrapper} artifacts/poster/launch${suffix}` },
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
}

test("pre hook still allows an unrelated repo-root shell", async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-unrelated-"));
  try {
    mkdirSync(join(root, "artifacts", "poster", "launch"), { recursive: true });
    const result = await run({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stop still validates when cwd is inside the poster project", async () => {
  const root = mkdtempSync(join(tmpdir(), "poster-stop-cwd-"));
  const project = join(root, "artifacts", "poster", "launch");
  try {
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "plan.contract.json"), JSON.stringify({ artifactId: "launch", targetStage: "release" }));
    const result = await runMode("stop", { cwd: project });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /REQUIRED_PATH_MISSING|Project contract violations/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

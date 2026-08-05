import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  catWriteClassification,
  catWriteDenyMessage,
} from "../scripts/checks/cat-write.mjs";
import {
  sedInplaceDenyMessage,
  sedInplaceHit,
} from "../scripts/checks/sed-inplace.mjs";
import {
  dangerousCommandDenyMessage,
  dangerousCommandHits,
} from "../scripts/checks/dangerous-command.mjs";

const PRE = fileURLToPath(
  new URL("../scripts/cmd-safety-hook-pre-tool.mjs", import.meta.url),
);
const CWD = "/repo/project";

test("cat-write classifies both heredoc redirect orders as deny", () => {
  assert.equal(
    catWriteClassification("cat > src/a.txt <<'EOF'\nx\nEOF").action,
    "deny",
  );
  assert.equal(
    catWriteClassification("cat <<'EOF' >> src/a.txt\nx\nEOF").action,
    "deny",
  );
});

test("cat-write allows heredoc pipeline input", () => {
  assert.equal(
    catWriteClassification("cat <<'EOF' | sh\necho ok\nEOF").action,
    "allow",
  );
});

test("cat-write reports temporary-file writes instead of denying", () => {
  assert.equal(
    catWriteClassification("cat > /tmp/a.sh <<'EOF'\necho ok\nEOF").action,
    "report",
  );
  assert.equal(
    catWriteClassification("cat <<EOF > $TMPDIR/a.sh\necho ok\nEOF").action,
    "report",
  );
});

test("cat-write deny message contains the complete blocking contract", () => {
  const message = catWriteDenyMessage("cat > a.txt <<EOF\nx\nEOF");

  for (const field of [
    "blockingContract",
    "observedFacts",
    "harm",
    "unblockWhen",
    "recovery",
  ]) {
    assert.match(message, new RegExp(field));
  }
});

test("sed-inplace detects bare short and long in-place options", () => {
  assert.equal(sedInplaceHit("sed -i 's/a/b/' src/a.txt"), true);
  assert.equal(sedInplaceHit("sed -Ei 's/a/b/' src/a.txt"), true);
  assert.equal(sedInplaceHit("sed --in-place 's/a/b/' src/a.txt"), true);
});

test("sed-inplace allows explicit backup and macOS empty suffix forms", () => {
  for (const command of [
    "sed -i.bak 's/a/b/' src/a.txt",
    "sed -i'.bak' 's/a/b/' src/a.txt",
    'sed -i".bak" "s/a/b/" src/a.txt',
    "sed -i '' 's/a/b/' src/a.txt",
    'sed -i "" "s/a/b/" src/a.txt',
    "sed --in-place=.bak 's/a/b/' src/a.txt",
  ]) {
    assert.equal(sedInplaceHit(command), false, command);
  }
});

test("sed-inplace ignores a literal in a git commit message", () => {
  assert.equal(
    sedInplaceHit("git commit -m 'document sed -i usage'"),
    false,
  );
});

test("sed-inplace deny message contains the complete blocking contract", () => {
  const message = sedInplaceDenyMessage("sed -i 's/a/b/' src/a.txt");

  for (const field of [
    "blockingContract",
    "observedFacts",
    "harm",
    "unblockWhen",
    "recovery",
  ]) {
    assert.match(message, new RegExp(field));
  }
});

test("dangerous-command detects filesystem, cwd, and home deletion targets", () => {
  const commands = [
    "rm -rf /",
    "rm -r .",
    "rm --recursive $PWD",
    "rm -rf ~",
    "rm -rf /tmp",
    "rm -rf /*",
  ];

  for (const command of commands) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-command detects wrappers, xargs, and nested shells", () => {
  const commands = [
    "sudo -u root rm -rf /",
    "env MODE=test command rm -rf /",
    "printf '%s\\n' build | xargs rm -rf",
    "bash -c 'rm -rf /'",
    "sh -lc 'rm -rf ${HOME}'",
    "rm -rf $'\\x2f'",
  ];

  for (const command of commands) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-command allows non-recursive and narrow recursive deletion", () => {
  const commands = [
    "rm -f /repo/project/file.txt",
    "rm -rf /repo/project/build/cache",
    "echo 'rm -rf /'",
    "printf ok && rm -rf ./build/cache",
  ];

  for (const command of commands) {
    assert.deepEqual(dangerousCommandHits(command, CWD), [], command);
  }
});

test("dangerous-command deny message contains the complete blocking contract", () => {
  const hits = dangerousCommandHits("rm -rf /", CWD);
  const message = dangerousCommandDenyMessage(hits, "rm -rf /");

  for (const field of [
    "blockingContract",
    "observedFacts",
    "harm",
    "unblockWhen",
    "recovery",
  ]) {
    assert.match(message, new RegExp(field));
  }
});

function runHook(event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PRE], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("entry denies dangerous command before lower-priority checks", async () => {
  const { code, stdout } = await runHook({
    cwd: CWD,
    tool_name: "Bash",
    tool_input: { command: "rm -rf /; sed -i 's/a/b/' src/a.txt" },
  });

  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Dangerous Command/);
});

test("entry denies cat heredoc for lowercase Codex shell tool", async () => {
  const { code, stdout } = await runHook({
    cwd: CWD,
    tool_name: "exec_command",
    tool_input: { cmd: "cat > src/a.txt <<'EOF'\nx\nEOF" },
  });

  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Cat Write Guard/);
});

test("entry denies bare sed in-place edits", async () => {
  const { code, stdout } = await runHook({
    cwd: CWD,
    tool_name: "shell_command",
    tool_input: { command: "sed -i 's/a/b/' src/a.txt" },
  });

  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /sed -i Guard/);
});

test("entry reports temporary cat heredoc through additionalContext", async () => {
  const { code, stdout } = await runHook({
    tool_name: "bash",
    tool_input: { command: "cat > /tmp/a.txt <<EOF\nx\nEOF" },
  });

  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.match(output.hookSpecificOutput.additionalContext, /Cat Write Guard/);
});

test("entry exits cleanly with no output for safe and non-shell tools", async () => {
  const safe = await runHook({
    tool_name: "Bash",
    tool_input: { command: "ls -la" },
  });
  const nonShell = await runHook({
    tool_name: "Write",
    tool_input: { file_path: "src/a.txt", content: "ok" },
  });

  assert.deepEqual(
    { code: safe.code, stdout: safe.stdout, stderr: safe.stderr },
    { code: 0, stdout: "", stderr: "" },
  );
  assert.deepEqual(
    {
      code: nonShell.code,
      stdout: nonShell.stdout,
      stderr: nonShell.stderr,
    },
    { code: 0, stdout: "", stderr: "" },
  );
});

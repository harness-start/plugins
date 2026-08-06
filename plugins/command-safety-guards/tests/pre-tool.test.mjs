import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { advancedCommandFindings } from "../scripts/checks/advanced-command.mjs";
import { fileSafetyReports } from "../scripts/checks/file-safety.mjs";
import { secretReadReport } from "../scripts/checks/secret-read.mjs";
import { escalationMessage, recordDeny } from "../scripts/lib/deny-state.mjs";

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

test("advanced command checks cover database, replication, active test, and audits", () => {
  const cases = [
    ["mysql -e 'DROP TABLE users'", "deny", "Dangerous SQL"],
    ["redis-cli FLUSHALL", "deny", "Redis CLI"],
    ["mysql -e 'STOP REPLICA'", "deny", "MySQL Replication"],
    ["nmap -p- 127.0.0.1", "deny", "Security Active"],
    ["lark-cli doc delete abc --yes", "report", "Lark CLI"],
    ["cat ~/.aws/credentials", "report", "Secret Leak"],
  ];
  for (const [command, action, id] of cases) { const finding = advancedCommandFindings(command)[0]; assert.equal(finding.action, action, command); assert.match(finding.id, new RegExp(id, "u"), command); }
  assert.deepEqual(advancedCommandFindings("psql -c 'SELECT 1'"), []);
  assert.deepEqual(advancedCommandFindings("nmap -p- --max-rate 50 127.0.0.1"), []);
});

test("secret read preserves templates and reports real credential paths", () => {
  assert.equal(secretReadReport(["docs/.env.example"]), null);
  assert.match(secretReadReport(["/work/.env"]), /Secret Read Notice/u);
  assert.match(secretReadReport(["~/.ssh/id_ed25519"]), /Secret Read Notice/u);
});

test("file reports detect SQL encoding, TLS bypass, and PII logging", () => {
  const root = mkdtempSync(join(tmpdir(), "command-safety-"));
  try {
    const sql = join(root, "schema.sql"); writeFileSync(sql, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("SELECT 1;\n")])); assert.match(fileSafetyReports(sql).join("\n"), /Database Encoding/u);
    const source = join(root, "client.js"); writeFileSync(source, "const agent = { rejectUnauthorized: false };\nlogger.info(user.email);\n"); const report = fileSafetyReports(source).join("\n"); assert.match(report, /Insecure TLS/u); assert.match(report, /Log PII/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("entry reports sensitive Read without opening the file", async () => {
  const { code, stdout } = await runHook({ tool_name: "Read", tool_input: { file_path: "/work/.env" } }); assert.equal(code, 0); const output = JSON.parse(stdout); assert.match(output.hookSpecificOutput.additionalContext, /Secret Read Notice/u);
});

test("plugin-local deny state escalates after three distinct turns", () => {
  const root = mkdtempSync(join(tmpdir(), "deny-state-")); const previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = root;
  try {
    const command = "redis-cli FLUSHALL";
    for (const turn_id of ["turn-1", "turn-2", "turn-3"]) recordDeny({ turn_id }, command, "Redis CLI Risk");
    assert.match(escalationMessage({ turn_id: "turn-4" }, command), /deny 3 次/u);
    assert.equal(escalationMessage({ turn_id: "turn-4" }, `${command} # escalation-ok`), null);
  } finally { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(root, { recursive: true, force: true }); }
});

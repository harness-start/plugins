import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatFinding,
  matchRule,
  resolveRules,
} from "../scripts/lib/rule-engine.mjs";
import {
  dangerousCommandDenyMessage,
  dangerousCommandHits,
} from "../scripts/engines/dangerous-rm.mjs";
import { mysqlReplicationPreflightFinding } from "../scripts/engines/mysql-preflight.mjs";
import { fileSafetyReports } from "../scripts/engines/file-safety.mjs";
import { secretReadReport } from "../scripts/engines/secret-read.mjs";
import { escalationMessage, recordDeny } from "../scripts/lib/deny-state.mjs";

const PRE = fileURLToPath(
  new URL("../scripts/cmd-safety-hook-pre-tool.mjs", import.meta.url),
);
const CWD = "/repo/project";

function builtIn(command) {
  const { rules } = resolveRules(null);
  return matchRule(command, rules);
}

test("builtin cat-write denies both heredoc redirect orders", () => {
  assert.equal(
    builtIn("cat > src/a.txt <<'EOF'\nx\nEOF")?.id,
    "cat-heredoc-repo-write",
  );
  assert.equal(
    builtIn("cat <<'EOF' >> src/a.txt\nx\nEOF")?.id,
    "cat-heredoc-repo-write",
  );
});

test("builtin cat-write allows heredoc pipeline input", () => {
  assert.equal(builtIn("cat <<'EOF' | sh\necho ok\nEOF"), null);
});

test("builtin cat-write reports temporary-file writes", () => {
  assert.equal(
    builtIn("cat > /tmp/a.sh <<'EOF'\necho ok\nEOF")?.mode,
    "report",
  );
  assert.equal(
    builtIn("cat <<EOF > $TMPDIR/a.sh\necho ok\nEOF")?.mode,
    "report",
  );
});

test("cat-write deny message contains the complete blocking contract", () => {
  const rule = builtIn("cat > a.txt <<EOF\nx\nEOF");
  const message = formatFinding(rule, "cat > a.txt <<EOF\nx\nEOF");
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

test("builtin sed-inplace detects bare short and long in-place options", () => {
  assert.equal(builtIn("sed -i 's/a/b/' src/a.txt")?.id, "sed-inplace");
  assert.equal(builtIn("sed -Ei 's/a/b/' src/a.txt")?.id, "sed-inplace");
  assert.equal(
    builtIn("sed --in-place 's/a/b/' src/a.txt")?.id,
    "sed-inplace",
  );
});

test("builtin sed-inplace allows explicit backup and macOS empty suffix forms", () => {
  for (const command of [
    "sed -i.bak 's/a/b/' src/a.txt",
    "sed -i'.bak' 's/a/b/' src/a.txt",
    'sed -i".bak" "s/a/b/" src/a.txt',
    "sed -i '' 's/a/b/' src/a.txt",
    'sed -i "" "s/a/b/" src/a.txt',
    "sed --in-place=.bak 's/a/b/' src/a.txt",
  ]) {
    assert.equal(builtIn(command), null, command);
  }
});

test("builtin sed-inplace allows unbacked -i only on temporary paths", () => {
  for (const command of [
    "sed -i 's/USE_TZ=True,/USE_TZ=False,/' /tmp/runtest.py",
    "sed -Ei 's/a/b/' /tmp/pytzstub/x.py",
    "sed --in-place 's/a/b/' /private/tmp/script.sh",
    "sed -i 's/a/b/' $TMPDIR/run.py",
    "sed -i 's/a/b/' ${TMPDIR}/run.py",
    "sed -i 's/a/b/' /tmp/a.py /tmp/b.py",
  ]) {
    assert.equal(builtIn(command), null, command);
  }
});

test("builtin sed-inplace still denies unbacked -i on repo or mixed paths", () => {
  assert.equal(builtIn("sed -i 's/a/b/' src/a.txt")?.id, "sed-inplace");
  assert.equal(builtIn("sed -i 's/a/b/' ./tmp/not-absolute.py")?.id, "sed-inplace");
  assert.equal(
    builtIn("sed -i 's/a/b/' /tmp/a.py src/a.txt")?.id,
    "sed-inplace",
  );
  assert.equal(builtIn("sed -i 's/a/b/'")?.id, "sed-inplace");
});

test("builtin sed-inplace ignores a literal in a git commit message", () => {
  assert.equal(builtIn("git commit -m 'document sed -i usage'"), null);
});

test("builtin edit and data rules ignore program names passed as printf arguments", () => {
  assert.equal(builtIn(`printf "%s %s\\n" sed -i`), null);
  assert.equal(
    builtIn(`printf "%s %s\\n" mysql "DROP TABLE users"`),
    null,
  );
  assert.equal(builtIn(`printf "%s %s\\n" redis-cli FLUSHALL`), null);
});

test("builtin audit rules ignore program names passed as printf arguments", () => {
  assert.equal(builtIn(`printf "%s %s\\n" nmap -p-`), null);
  assert.equal(builtIn(`printf "%s %s\\n" lark-cli --yes`), null);
  assert.equal(
    builtIn(`printf "%s %s\\n" cat ~/.aws/credentials`),
    null,
  );
});

test("builtin data rules keep SQL text scoped to the matching command segment", () => {
  assert.equal(
    builtIn(`mysql -e "SELECT 1"; printf "%s\\n" "DROP TABLE users"`),
    null,
  );
});

test("builtin rules still inspect executables behind supported wrappers", () => {
  assert.equal(builtIn(`command sed -i "s/a/b/" src/a.txt`)?.id, "sed-inplace");
  assert.equal(builtIn(`sudo redis-cli FLUSHALL`)?.id, "redis-cli-risk");
  assert.equal(
    builtIn(`env MYSQL_PWD=x mysql -e "DROP TABLE users"`)?.id,
    "sql-destructive",
  );
});

test("sed-inplace deny message contains the complete blocking contract", () => {
  const rule = builtIn("sed -i 's/a/b/' src/a.txt");
  const message = formatFinding(rule, "sed -i 's/a/b/' src/a.txt");
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

test("dangerous-rm detects filesystem, cwd, and home deletion targets", () => {
  for (const command of [
    "rm -rf /",
    "rm -r .",
    "rm --recursive $PWD",
    "rm -rf ~",
    "rm -rf /tmp",
    "rm -rf /*",
  ]) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-rm detects wrappers, xargs, and nested shells", () => {
  for (const command of [
    "sudo -u root rm -rf /",
    "env MODE=test command rm -rf /",
    "printf '%s\\n' build | xargs rm -rf",
    "bash -c 'rm -rf /'",
    "sh -lc 'rm -rf ${HOME}'",
    "rm -rf $'\\x2f'",
  ]) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-rm detects timing wrappers, busybox, eval, and find -delete", () => {
  for (const command of [
    "timeout 5 rm -rf /",
    "nice rm -rf /",
    "time rm -rf /",
    "stdbuf -oL rm -rf /",
    "ionice -c3 rm -rf /",
    "busybox rm -rf /",
    "eval rm -rf /",
    "eval 'rm -rf /'",
    "timeout 5 bash -c \"rm -rf /\"",
    "find / -delete",
    "find . -type f -delete",
    "find /tmp -delete",
    "find ~ -delete",
  ]) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-rm inspects broad globs and nested command substitutions", () => {
  const recursiveDelete = "rm " + "-rf ";
  for (const command of [
    `${recursiveDelete}*`,
    `${recursiveDelete}**`,
    `${recursiveDelete}** /`,
    `${recursiveDelete}./**/*`,
    `echo $(${recursiveDelete}/)`,
    `x=$(${recursiveDelete}/)`,
    `echo \`${recursiveDelete}/\``,
  ]) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-rm classifies wrappers by basename, including absolute paths", () => {
  for (const command of [
    "/usr/bin/timeout 5 rm -rf /",
    "/usr/bin/nice rm -rf /",
    "/usr/bin/time rm -rf /",
    "/usr/bin/stdbuf -oL rm -rf /",
    "/usr/bin/ionice -c3 rm -rf /",
    "/bin/busybox rm -rf /",
    "/usr/bin/sudo -u root rm -rf /",
    "/usr/bin/env MODE=test command rm -rf /",
  ]) {
    assert.equal(dangerousCommandHits(command, CWD).length, 1, command);
  }
});

test("dangerous-rm allows non-recursive and narrow recursive deletion", () => {
  for (const command of [
    "rm -f /repo/project/file.txt",
    "rm -rf /repo/project/build/cache",
    "echo 'rm -rf /'",
    "printf ok && rm -rf ./build/cache",
  ]) {
    assert.deepEqual(dangerousCommandHits(command, CWD), [], command);
  }
});

test("dangerous-rm deny message contains the complete blocking contract", () => {
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

test("entry denies wrapped recursive deletion", async () => {
  const { code, stdout } = await runHook({
    cwd: CWD,
    tool_name: "Bash",
    tool_input: { command: "timeout 5 rm -rf /" },
  });
  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Dangerous Command/u);
});

test("entry denies absolute-path timeout wrapping recursive deletion", async () => {
  const { code, stdout } = await runHook({
    cwd: CWD,
    tool_name: "Bash",
    tool_input: { command: "/usr/bin/timeout 5 rm -rf /" },
  });
  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Dangerous Command/u);
});

test("entry denies dangerous command before lower-priority checks", async () => {
  const { code, stdout } = await runHook({
    cwd: CWD,
    tool_name: "Bash",
    tool_input: { command: "rm -rf /; sed -i 's/a/b/' src/a.txt" },
  });
  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(
    output.hookSpecificOutput.permissionDecisionReason,
    /Dangerous Command/,
  );
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
  assert.match(
    output.hookSpecificOutput.permissionDecisionReason,
    /Cat Write Guard/,
  );
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
  assert.match(
    output.hookSpecificOutput.permissionDecisionReason,
    /sed -i Guard/,
  );
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

test("builtin rules cover database, active test, and audits", () => {
  const cases = [
    ["mysql -e 'DROP TABLE users'", "deny", "sql-destructive"],
    ["redis-cli FLUSHALL", "deny", "redis-cli-risk"],
    ["nmap -p- 127.0.0.1", "deny", "active-test-unbounded"],
    ["lark-cli doc delete abc --yes", "report", "lark-yes"],
    ["cat ~/.aws/credentials", "report", "secret-leak"],
  ];
  for (const [command, mode, id] of cases) {
    const hit = builtIn(command);
    assert.equal(hit?.mode, mode, command);
    assert.equal(hit?.id, id, command);
  }
  assert.equal(builtIn("psql -c 'SELECT 1'"), null);
  assert.equal(builtIn("nmap -p- --max-rate 50 127.0.0.1"), null);
});

test("mysql preflight engine denies STOP REPLICA without evidence", () => {
  const finding = mysqlReplicationPreflightFinding("mysql -e 'STOP REPLICA'");
  assert.equal(finding?.action, "deny");
  assert.match(finding.id, /MySQL Replication/);
  assert.equal(
    mysqlReplicationPreflightFinding("mysql -e 'STOP REPLICA'", {
      tool: "mysql-replication-preflight",
      exit_code: 0,
    }),
    null,
  );
});

test("mysql preflight rejects success markers embedded in the current command", () => {
  const command =
    `mysql -e "STOP REPLICA" # mysql-replication-preflight exit_code:0`;
  const finding = mysqlReplicationPreflightFinding(command, {
    tool_name: "Bash",
    tool_input: { command },
  });

  assert.equal(finding?.action, "deny");
  assert.match(finding.reason, /missing successful replication preflight evidence/u);
});

test("mysql preflight rejects unrelated nested evidence and timed out results", () => {
  const command = `mysql -e "STOP REPLICA"`;
  const nested = mysqlReplicationPreflightFinding(command, {
    metadata: {
      tool: "mysql-replication-preflight",
      exit_code: 0,
    },
  });
  const timedOut = mysqlReplicationPreflightFinding(command, {
    tool: "mysql-replication-preflight",
    exit_code: 0,
    timed_out: true,
  });

  assert.equal(nested?.action, "deny");
  assert.equal(timedOut?.action, "deny");
});

test("secret read preserves templates and reports real credential paths", () => {
  assert.equal(secretReadReport(["docs/.env.example"]), null);
  assert.match(secretReadReport(["/work/.env"]), /Secret Read Notice/u);
  assert.match(secretReadReport(["~/.ssh/id_ed25519"]), /Secret Read Notice/u);
});

test("file reports detect TLS bypass and PII logging", () => {
  const root = mkdtempSync(join(tmpdir(), "command-safety-"));
  try {
    const source = join(root, "client.js");
    writeFileSync(
      source,
      "const agent = { rejectUnauthorized: false };\nlogger.info(user.email);\n",
    );
    const report = fileSafetyReports(source).join("\n");
    assert.match(report, /Insecure TLS/u);
    assert.match(report, /Log PII/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry reports sensitive Read without opening the file", async () => {
  const { code, stdout } = await runHook({
    tool_name: "Read",
    tool_input: { file_path: "/work/.env" },
  });
  assert.equal(code, 0);
  const output = JSON.parse(stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /Secret Read Notice/u);
});

test("plugin-local deny state escalates after three distinct turns", () => {
  const root = mkdtempSync(join(tmpdir(), "deny-state-"));
  try {
    const command = "redis-cli FLUSHALL";
    for (const turn_id of ["turn-1", "turn-2", "turn-3"]) {
      recordDeny({ turn_id, cwd: root }, command, "redis-cli-risk");
    }
    assert.match(escalationMessage({ turn_id: "turn-4", cwd: root }, command), /denied the same target 3 times/u);
    assert.equal(
      escalationMessage({ turn_id: "turn-4", cwd: root }, `${command} # escalation-ok`),
      null,
    );
    assert.equal(existsSync(join(root, ".command-safety-guards", ".state", "denies.jsonl")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry loads project config: custom deny and allow override", async () => {
  const root = mkdtempSync(join(tmpdir(), "cmd-safety-hook-cfg-"));
  try {
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    writeFileSync(
      join(root, ".command-safety-guards.mjs"),
      `export default {
  rules: [
    { id: "allow-flushall", match: /\\bredis-cli\\b[^\\n]*\\bFLUSHALL\\b/iu, mode: "allow" },
    { id: "no-force-push", match: /\\bgit\\s+push\\b[^\\n]*--force\\b/iu, mode: "deny", title: "Git Force Push Guard", reason: "no force", recovery: "use lease" },
  ],
};
`,
    );

    const denied = await runHook({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" },
    });
    assert.equal(denied.code, 0);
    const deniedOut = JSON.parse(denied.stdout);
    assert.equal(deniedOut.hookSpecificOutput.permissionDecision, "deny");
    assert.match(
      deniedOut.hookSpecificOutput.permissionDecisionReason,
      /Git Force Push Guard/,
    );

    const allowed = await runHook({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "redis-cli FLUSHALL" },
    });
    assert.deepEqual(
      { code: allowed.code, stdout: allowed.stdout },
      { code: 0, stdout: "" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

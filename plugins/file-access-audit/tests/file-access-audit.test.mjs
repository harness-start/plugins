import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveConfig } from "../scripts/lib/config.mjs";
import { extractStructuredFileAccess, extractToolUseId } from "../scripts/lib/hook-io.mjs";
import {
  appendRecord,
  rewriteTip,
  sanitizeSessionKey,
} from "../scripts/lib/jsonl-trail.mjs";
import {
  shellMutatesAuditRoot,
} from "../scripts/lib/protect.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/file-access-audit.mjs", import.meta.url));

function workspace(prefix = "file-access-audit-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.js"), "export const value = 0;\n");
  return root;
}

function runEntry(mode, event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env },
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

function readSessionLines(root, sessionId) {
  const path = join(root, ".file-access-audit", "sessions", `${sessionId}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("resolveConfig rejects unsafe auditRoot", () => {
  const warnings = [];
  assert.equal(resolveConfig({ auditRoot: "../escape" }, (m) => warnings.push(m)).auditRoot, ".file-access-audit");
  assert.equal(resolveConfig({ auditRoot: "src" }, (m) => warnings.push(m)).auditRoot, ".file-access-audit");
  assert.equal(resolveConfig({ auditRoot: "/abs" }, (m) => warnings.push(m)).auditRoot, ".file-access-audit");
  assert.ok(warnings.length >= 2);
});

test("extractStructuredFileAccess handles Edit and apply_patch", () => {
  const edit = extractStructuredFileAccess({
    cwd: "/tmp/proj",
    tool_name: "Edit",
    tool_input: { file_path: "src/app.js" },
  });
  assert.equal(edit.op, "update");
  assert.ok(edit.paths[0].endsWith("src/app.js"));

  const patch = extractStructuredFileAccess({
    cwd: "/tmp/proj",
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: src/a.js\n*** Add File: src/b.js\n*** End Patch",
    },
  });
  assert.equal(patch.paths.length, 2);
});

test("extractToolUseId ignores bare event.id", () => {
  assert.equal(extractToolUseId({ id: "evt-1", tool_use_id: "tu-1" }), "tu-1");
  assert.equal(extractToolUseId({ id: "evt-only" }), null);
});

test("sanitizeSessionKey falls back to cwd hash", () => {
  assert.match(sanitizeSessionKey(null, "/some/path"), /^cwd-[a-f0-9]{16}$/u);
});

test("jsonl rewriteTip only rewrites last line", () => {
  const root = mkdtempSync(join(tmpdir(), "trail-"));
  const path = join(root, "session.jsonl");
  appendRecord(path, { id: 1, status: "done" });
  appendRecord(path, { id: 2, status: "pending" });
  const result = rewriteTip(
    path,
    (parsed) => parsed.status === "pending",
    { id: 2, status: "success" },
  );
  assert.equal(result, "rewritten");
  const lines = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].status, "done");
  assert.equal(lines[1].status, "success");
  rmSync(root, { recursive: true, force: true });
});

test("shell protect allows node without audit root and denies /bin/rm of trail", () => {
  const rel = ".file-access-audit";
  const abs = "/tmp/p/.file-access-audit";
  assert.equal(shellMutatesAuditRoot("node build.js --out logs", rel, abs), false);
  assert.equal(shellMutatesAuditRoot("/bin/rm -rf .file-access-audit", rel, abs), true);
  assert.equal(shellMutatesAuditRoot("cat .file-access-audit/sessions/x.jsonl", rel, abs), false);
  assert.equal(
    shellMutatesAuditRoot(
      "python3 -c \"open('.file-access-audit/sessions/x.jsonl','w').write('x')\"",
      rel,
      abs,
    ),
    true,
  );
});

test("pre denies interpreter rewrite of the file-access trail", async () => {
  const root = workspace();
  try {
    const deny = await runEntry("pre", {
      cwd: root,
      session_id: "sess-py",
      tool_name: "Bash",
      tool_input: {
        command: "node -e \"require('fs').writeFileSync('.file-access-audit/sessions/s.jsonl','x')\"",
      },
    });
    assert.equal(JSON.parse(deny.stdout.trim()).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post records edit without modifying the project gitignore", async () => {
  const root = workspace();
  try {
    writeFileSync(join(root, ".gitignore"), "vendor/\n", "utf8");
    const result = await runEntry("post", {
      cwd: root,
      session_id: "sess-alpha",
      tool_name: "Edit",
      tool_use_id: "tu-1",
      tool_input: { file_path: "src/app.js", old_string: "0", new_string: "1" },
    });
    assert.equal(result.code, 0);
    const lines = readSessionLines(root, "sess-alpha");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].schema, "file-access/v1");
    assert.equal(lines[0].op, "update");
    assert.deepEqual(lines[0].paths, ["src/app.js"]);

    await runEntry("post", {
      cwd: root,
      session_id: "sess-beta",
      tool_name: "Read",
      tool_input: { file_path: "src/app.js" },
    });
    assert.equal(readSessionLines(root, "sess-beta").length, 1);
    assert.equal(readSessionLines(root, "sess-alpha").length, 1);

    assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "vendor/\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre denies edit of audit session file", async () => {
  const root = workspace();
  try {
    mkdirSync(join(root, ".file-access-audit", "sessions"), { recursive: true });
    writeFileSync(join(root, ".file-access-audit", "sessions", "sess.jsonl"), "{}\n");
    const result = await runEntry("pre", {
      cwd: root,
      session_id: "sess",
      tool_name: "Edit",
      tool_input: {
        file_path: ".file-access-audit/sessions/sess.jsonl",
        old_string: "{}",
        new_string: "x",
      },
    });
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.hookSpecificOutput.permissionDecision, "deny");
    assert.match(payload.hookSpecificOutput.permissionDecisionReason, /Read\/Edit\/Write/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed stdin fails open", async () => {
  const result = await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "post"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout }));
    child.stdin.end("{not-json");
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "");
});

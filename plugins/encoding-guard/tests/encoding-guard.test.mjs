import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  extractFilePaths,
  matchRule,
  resolveRules,
} from "../scripts/encoding-guard.mjs";
import { analyzeEncoding } from "../scripts/lib/encoding-policy.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/encoding-guard.mjs", import.meta.url),
);

test("analyzeEncoding identifies every BOM with longest signature first", () => {
  const cases = [
    [[0xff, 0xfe, 0x00, 0x00, 0x41], "UTF-32 LE BOM"],
    [[0x00, 0x00, 0xfe, 0xff, 0x41], "UTF-32 BE BOM"],
    [[0xef, 0xbb, 0xbf, 0x41], "UTF-8 BOM"],
    [[0xff, 0xfe, 0x41, 0x00], "UTF-16 LE BOM"],
    [[0xfe, 0xff, 0x00, 0x41], "UTF-16 BE BOM"],
  ];

  for (const [bytes, name] of cases) {
    assert.equal(analyzeEncoding(Buffer.from(bytes))?.name, name);
  }
});

test("analyzeEncoding allows empty and valid UTF-8 text", () => {
  assert.equal(analyzeEncoding(Buffer.alloc(0)), null);
  assert.equal(analyzeEncoding(Buffer.from("合法 UTF-8 😀\n", "utf8")), null);
});

test("analyzeEncoding rejects adversarial invalid UTF-8 sequences", () => {
  const cases = [
    [0x80],
    [0xc0, 0x80],
    [0xe2, 0x82],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
  ];

  for (const bytes of cases) {
    assert.deepEqual(analyzeEncoding(Buffer.from(bytes)), {
      kind: "invalid-utf8",
    });
  }
});

test("resolveRules prepends normalized user block and skip overrides", () => {
  const customBlock = { match: /\.properties$/u };
  const customSkip = { match: /^fixtures\//u, mode: "skip" };
  const rules = resolveRules(
    { rules: [customSkip, customBlock] },
    () => {},
  );

  assert.equal(matchRule("fixtures/data.sql", rules)?.mode, "skip");
  assert.equal(matchRule("src/app.properties", rules)?.mode, "block");
  assert.equal(matchRule("src/app.ts", rules)?.mode, "block");
});

test("built-ins skip generated paths and cover configured dotfiles", () => {
  const rules = resolveRules(null, () => {});

  assert.equal(matchRule("dist/app.js", rules)?.mode, "skip");
  assert.equal(matchRule("src/.env.local", rules)?.mode, "block");
  assert.equal(matchRule("templates/page.twig", rules)?.mode, "block");
  assert.equal(matchRule("assets/image.png", rules), null);
});

test("resolveRules rejects malformed entries without losing built-ins", () => {
  const warnings = [];
  const rules = resolveRules(
    { rules: [{ match: "\\.ts$" }, { match: /\.ts$/u, mode: "report" }] },
    (message) => warnings.push(message),
  );

  assert.equal(warnings.length, 2);
  assert.equal(matchRule("src/app.ts", rules)?.mode, "block");
});

test("matchRule is stable for stateful global regular expressions", () => {
  const rules = resolveRules(
    { rules: [{ match: /\.custom$/gu, mode: "block" }] },
    () => {},
  );

  assert.equal(matchRule("a.custom", rules)?.mode, "block");
  assert.equal(matchRule("a.custom", rules)?.mode, "block");
});

test("extractFilePaths normalizes direct, patch, and quoted redirect targets", () => {
  const paths = extractFilePaths({
    cwd: "/repo",
    tool_input: {
      file_path: "src/direct.ts",
      patch: "*** Update File: src/patched.ts",
      command: "printf x > \"src/generated.ts\"",
    },
  });

  assert.deepEqual(paths, [
    "/repo/src/direct.ts",
    "/repo/src/patched.ts",
    "/repo/src/generated.ts",
  ]);
});

function runEntry(input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolvePromise({ code, stdout, stderr }),
    );
    child.stdin.end(input);
  });
}

test("entry blocks a matched BOM file and allows a clean replacement", async () => {
  const root = mkdtempSync(join(tmpdir(), "encoding-guard-"));
  try {
    const target = join(root, "sample.php");
    writeFileSync(
      target,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("<?php\n", "utf8"),
      ]),
    );
    const event = JSON.stringify({ cwd: root, tool_input: { file_path: target } });
    const blocked = await runEntry(event);
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /\[Encoding Guard\]/u);
    assert.match(blocked.stderr, /UTF-8 BOM/u);

    writeFileSync(target, "<?php\n", "utf8");
    const allowed = await runEntry(event);
    assert.equal(allowed.code, 0);
    assert.equal(allowed.stdout, "");
    assert.equal(allowed.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry loads a project skip override before built-ins", async () => {
  const root = mkdtempSync(join(tmpdir(), "encoding-guard-config-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    mkdirSync(join(root, "fixtures"));
    writeFileSync(
      join(root, ".encoding-guard.mjs"),
      'export default { rules: [{ match: /^fixtures\\//, mode: "skip" }] };\n',
      "utf8",
    );
    const target = join(root, "fixtures", "legacy.sql");
    writeFileSync(target, Buffer.from([0xff, 0xfe, 0x41, 0x00]));

    const result = await runEntry(
      JSON.stringify({ cwd: root, tool_input: { file_path: target } }),
    );
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry fails open without output for malformed JSON", async () => {
  const result = await runEntry("{");
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

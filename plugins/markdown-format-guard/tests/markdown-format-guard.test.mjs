import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { extractFilePaths } from "../scripts/markdown-format-guard.mjs";
import {
  analyzeMarkdown,
  buildDocumentModel,
  isMarkdownPath,
  modeFor,
  resolveConfig,
} from "../scripts/lib/markdown-policy.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/markdown-format-guard.mjs", import.meta.url),
);

function checksOf(result, name) {
  return [...result.block, ...result.report].filter((f) => f.check === name);
}

function cleanDoc(body) {
  return body.endsWith("\n") ? body : `${body}\n`;
}

test("isMarkdownPath accepts markdown extensions and skips vendor trees", () => {
  assert.equal(isMarkdownPath("docs/guide.md"), true);
  assert.equal(isMarkdownPath("README.markdown"), true);
  assert.equal(isMarkdownPath("notes.mdown"), true);
  assert.equal(isMarkdownPath("src/app.ts"), false);
  assert.equal(isMarkdownPath("node_modules/pkg/README.md"), false);
  assert.equal(isMarkdownPath("dist/out.md"), false);
});

test("resolveConfig defaults and normalizes overrides", () => {
  const warnings = [];
  const config = resolveConfig(
    {
      checks: { singleH1: "block", fencedCodeLanguage: "off" },
      overrides: [
        { match: /^CHANGELOG\.md$/i, checks: { headingIncrement: "off" } },
        { match: "bad", checks: { headingIncrement: "off" } },
      ],
    },
    (message) => warnings.push(message),
  );

  assert.equal(config.checks.singleH1, "block");
  assert.equal(config.checks.fencedCodeLanguage, "off");
  assert.equal(config.checks.headingIncrement, "block");
  assert.equal(
    modeFor("headingIncrement", "CHANGELOG.md", config),
    "off",
  );
  assert.equal(
    modeFor("headingIncrement", "docs/a.md", config),
    "block",
  );
  assert.ok(warnings.some((w) => w.includes("override[1]")));
});

test("headingIncrement blocks level jumps", () => {
  const text = cleanDoc(`# Title

## Section

#### Too deep

Body.
`);
  const result = analyzeMarkdown(text, "doc.md", resolveConfig(null));
  assert.ok(checksOf(result, "headingIncrement").length >= 1);
  assert.equal(result.block.some((f) => f.check === "headingIncrement"), true);
});

test("headingStyle blocks setext headings", () => {
  const text = cleanDoc(`Title
=====

Body.
`);
  const result = analyzeMarkdown(text, "doc.md", resolveConfig(null));
  assert.ok(checksOf(result, "headingStyle").length >= 1);
});

test("headingSpace and emptyHeading", () => {
  const noSpace = analyzeMarkdown(
    cleanDoc("#Title\n\nBody.\n"),
    "doc.md",
    resolveConfig(null),
  );
  assert.ok(checksOf(noSpace, "headingSpace").length >= 1);

  const empty = analyzeMarkdown(
    cleanDoc("#\n\nBody.\n"),
    "doc.md",
    resolveConfig(null),
  );
  assert.ok(checksOf(empty, "emptyHeading").length >= 1);
});

test("headingBlankLines requires surrounding blanks", () => {
  const text = cleanDoc(`# Title
## Next
Body.
`);
  const result = analyzeMarkdown(text, "doc.md", resolveConfig(null));
  assert.ok(checksOf(result, "headingBlankLines").length >= 1);
});

test("hardTabs trailingWhitespace multipleBlankLines finalNewline", () => {
  const tabs = analyzeMarkdown(
    "# Title\n\n\tindented\n",
    "doc.md",
    resolveConfig(null),
  );
  assert.ok(checksOf(tabs, "hardTabs").length >= 1);

  const trail = analyzeMarkdown(
    "# Title\n\nline   \n",
    "doc.md",
    resolveConfig(null),
  );
  assert.ok(checksOf(trail, "trailingWhitespace").length >= 1);

  const hardBreak = analyzeMarkdown(
    "# Title\n\nline  \nnext\n",
    "doc.md",
    resolveConfig(null),
  );
  assert.equal(checksOf(hardBreak, "trailingWhitespace").length, 0);

  const blanks = analyzeMarkdown(
    "# Title\n\n\n\nBody.\n",
    "doc.md",
    resolveConfig(null),
  );
  assert.ok(checksOf(blanks, "multipleBlankLines").length >= 1);

  const noNl = analyzeMarkdown("# Title\n\nBody.", "doc.md", resolveConfig(null));
  assert.ok(checksOf(noNl, "finalNewline").length >= 1);
});

test("fenced code closed language and ignores headings inside fences", () => {
  const unclosed = analyzeMarkdown(
    cleanDoc("# Title\n\n```js\nconst x = 1;\n"),
    "doc.md",
    resolveConfig(null),
  );
  assert.ok(checksOf(unclosed, "fencedCodeClosed").length >= 1);

  const noLang = analyzeMarkdown(
    cleanDoc("# Title\n\n```\ncode\n```\n"),
    "doc.md",
    resolveConfig(null),
  );
  assert.equal(noLang.report.some((f) => f.check === "fencedCodeLanguage"), true);
  assert.equal(noLang.block.some((f) => f.check === "fencedCodeLanguage"), false);

  const fakeHeading = analyzeMarkdown(
    cleanDoc(`# Title

\`\`\`md
#### Not a real heading
\`\`\`
`),
    "doc.md",
    resolveConfig(null),
  );
  assert.equal(checksOf(fakeHeading, "headingIncrement").length, 0);
});

test("front matter hash is not a heading", () => {
  const text = cleanDoc(`---
title: # not a heading
---

# Real

Body.
`);
  const model = buildDocumentModel(text);
  assert.equal(model.headings.length, 1);
  assert.equal(model.headings[0].text, "Real");
});

test("singleH1 is off by default and blocks when enabled", () => {
  const text = cleanDoc(`# One

# Two

Body.
`);
  const off = analyzeMarkdown(text, "doc.md", resolveConfig(null));
  assert.equal(checksOf(off, "singleH1").length, 0);

  const on = analyzeMarkdown(
    text,
    "doc.md",
    resolveConfig({ checks: { singleH1: "block" } }),
  );
  assert.ok(checksOf(on, "singleH1").length >= 1);
});

test("clean well-formed document has no block findings", () => {
  const text = cleanDoc(`# Guide

Intro paragraph.

## Setup

Steps here.

### Details

\`\`\`bash
echo ok
\`\`\`
`);
  const result = analyzeMarkdown(text, "docs/guide.md", resolveConfig(null));
  assert.deepEqual(result.block, []);
});

test("extractFilePaths normalizes direct and patch targets", () => {
  const paths = extractFilePaths({
    cwd: "/repo",
    tool_input: {
      file_path: "docs/a.md",
      patch: "*** Update File: docs/b.md",
    },
  });
  assert.deepEqual(paths, ["/repo/docs/a.md", "/repo/docs/b.md"]);
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

test("entry blocks jumped headings and allows a clean replacement", async () => {
  const root = mkdtempSync(join(tmpdir(), "md-format-guard-"));
  try {
    const target = join(root, "guide.md");
    writeFileSync(
      target,
      "# Guide\n\n## Setup\n\n#### Nested\n\nDetails.\n",
      "utf8",
    );
    const event = JSON.stringify({ cwd: root, tool_input: { file_path: target } });
    const blocked = await runEntry(event);
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /\[Markdown Format Guard\]/u);
    assert.match(blocked.stderr, /headingIncrement/u);

    writeFileSync(
      target,
      "# Guide\n\n## Setup\n\n### Nested\n\nDetails.\n",
      "utf8",
    );
    const allowed = await runEntry(event);
    assert.equal(allowed.code, 0);
    assert.equal(allowed.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry loads project override to disable headingIncrement", async () => {
  const root = mkdtempSync(join(tmpdir(), "md-format-config-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(
      join(root, ".markdown-format-guard.mjs"),
      'export default { checks: { headingIncrement: "off" } };\n',
      "utf8",
    );
    const target = join(root, "guide.md");
    writeFileSync(
      target,
      "# Guide\n\n## Setup\n\n#### Nested\n\nDetails.\n",
      "utf8",
    );
    const result = await runEntry(
      JSON.stringify({ cwd: root, tool_input: { file_path: target } }),
    );
    assert.equal(result.code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry ignores non-markdown and fails open on bad JSON", async () => {
  const root = mkdtempSync(join(tmpdir(), "md-format-skip-"));
  try {
    const target = join(root, "app.ts");
    writeFileSync(target, "const x = 1;\n", "utf8");
    const skip = await runEntry(
      JSON.stringify({ cwd: root, tool_input: { file_path: target } }),
    );
    assert.equal(skip.code, 0);

    const bad = await runEntry("{");
    assert.equal(bad.code, 0);
    assert.equal(bad.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entry report-only fencedCodeLanguage does not exit 2", async () => {
  const root = mkdtempSync(join(tmpdir(), "md-format-report-"));
  try {
    const target = join(root, "note.md");
    writeFileSync(
      target,
      "# Title\n\n```\ncode\n```\n",
      "utf8",
    );
    const result = await runEntry(
      JSON.stringify({ cwd: root, tool_input: { file_path: target } }),
    );
    assert.equal(result.code, 0);
    assert.match(result.stderr, /fencedCodeLanguage|report/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  canonicalText,
  digestText,
  inspectChange,
  validatePlanText,
  validateSpecText,
  validateTasksText,
} from "../scripts/lib/artifacts.mjs";

const SPEC = `# Spec: Cache refresh

## Intent
Refresh stale cache entries without changing the public API.

## Requirements

### REQ-001: Refresh stale entries
The cache refreshes an entry after its expiry time.

#### Scenario: stale entry
- Given an expired cache entry
- When the entry is read
- Then the entry is refreshed once

### REQ-002: Preserve fresh entries
Fresh entries remain unchanged.

#### Scenario: fresh entry
- Given a fresh cache entry
- When the entry is read
- Then the stored value is returned unchanged

## Non-goals
- Changing the cache public API.
`;

function plan(spec = SPEC) {
  return `# Plan: Cache refresh

Spec-Digest: sha256:${digestText(spec)}

## Approach
Implement expiry-aware refresh for REQ-001 while preserving the REQ-002 fast path.

## Change Surface
- src/cache.js
- test/cache.test.js

## Risks
- Duplicate refresh under contention.

## Validation
- Run the focused cache tests for REQ-001 and REQ-002.
`;
}

function tasks(spec = SPEC, planText = plan(spec)) {
  return `# Tasks: Cache refresh

Spec-Digest: sha256:${digestText(spec)}
Plan-Digest: sha256:${digestText(planText)}

## TASK-001: Add stale-entry coverage
- Requirement: REQ-001
- Depends: none
- Files: test/cache.test.js
- Verify: node --test test/cache.test.js

## TASK-002: Implement refresh
- Requirement: REQ-001, REQ-002
- Depends: TASK-001
- Files: src/cache.js
- Verify: node --test test/cache.test.js
`;
}

test("canonical text normalizes BOM, CRLF, and trailing newlines", () => {
  assert.equal(canonicalText(`\uFEFFa\r\n\r\n\r\n`), "a\n");
  assert.equal(digestText(SPEC.replaceAll("\n", "\r\n")), digestText(SPEC));
});

test("spec requires intent, unique requirements, scenarios, and non-goals", () => {
  assert.deepEqual(validateSpecText(SPEC).findings, []);
  assert.ok(validateSpecText(SPEC.replace("## Intent", "## Motivation")).findings.length);
  assert.ok(validateSpecText(SPEC.replace("### REQ-002", "### REQ-001")).findings.some((f) => f.code === "duplicate-requirement"));
  assert.ok(validateSpecText(SPEC.replace("- Then the stored value is returned unchanged", "Then eventually correct")).findings.some((f) => f.code === "invalid-scenario"));
  assert.ok(validateSpecText(SPEC.replace("Fresh entries remain unchanged.", "TBD")).findings.some((f) => f.code === "unresolved-marker"));
});

test("artifact grammar ignores fenced and commented pseudo-structure", () => {
  const fencedSpec = `\`\`\`markdown\n${SPEC}\`\`\`\n`;
  const fencedPlan = `\`\`\`markdown\n${plan()}\`\`\`\n`;
  const fencedTasks = `\`\`\`markdown\n${tasks()}\`\`\`\n`;
  assert.ok(validateSpecText(fencedSpec).findings.some((f) => f.code === "missing-section"));
  assert.ok(validatePlanText(fencedPlan, validateSpecText(SPEC)).findings.some((f) => f.code === "missing-section"));
  assert.ok(validateTasksText(fencedTasks, validateSpecText(SPEC), validatePlanText(plan(), validateSpecText(SPEC))).findings.some((f) => f.code === "missing-task"));

  const commentedDuplicate = SPEC.replace("## Intent", "<!-- ## Intent\nforged\n-->\n## Intent");
  assert.equal(validateSpecText(commentedDuplicate).findings.some((f) => f.code === "duplicate-section"), false);

  const rawHtmlSpec = `<pre>\n${SPEC}</pre>\n`;
  assert.ok(validateSpecText(rawHtmlSpec).findings.some((f) => f.code === "raw-html-block"));

  const inlineCommentLiteral = SPEC.replace("Refresh stale cache entries", "Document `<!--` literally and refresh stale cache entries");
  assert.deepEqual(validateSpecText(inlineCommentLiteral).findings, []);

  const unmatchedRunBeforeInlineCode = SPEC.replace("Refresh stale cache entries", "Document unmatched `` and later `<!--` literally while refreshing stale cache entries");
  assert.deepEqual(validateSpecText(unmatchedRunBeforeInlineCode).findings, []);
});

test("all CommonMark raw HTML block starts invalidate every artifact kind", () => {
  const wrappers = [
    (text) => `<?sdd\n${text}?>\n`,
    (text) => `<![CDATA[\n${text}]]>\n`,
    (text) => `<!SDD\n${text}>\n`,
    (text) => `<x-sdd>\n${text}</x-sdd>\n`,
  ];
  const specResult = validateSpecText(SPEC);
  const planResult = validatePlanText(plan(), specResult);
  for (const wrap of wrappers) {
    assert.ok(validateSpecText(wrap(SPEC)).findings.some((finding) => finding.code === "raw-html-block"));
    assert.ok(validatePlanText(wrap(plan()), specResult).findings.some((finding) => finding.code === "raw-html-block"));
    assert.ok(validateTasksText(wrap(tasks()), specResult, planResult).findings.some((finding) => finding.code === "raw-html-block"));
  }
});

test("plan binds the current spec and covers every requirement", () => {
  assert.deepEqual(validatePlanText(plan(), validateSpecText(SPEC)).findings, []);
  assert.ok(validatePlanText(plan().replace(digestText(SPEC), "0".repeat(64)), validateSpecText(SPEC)).findings.some((f) => f.code === "stale-spec-digest"));
  assert.ok(validatePlanText(plan().replaceAll("REQ-002", "REQ-001"), validateSpecText(SPEC)).findings.some((f) => f.code === "uncovered-requirement"));
});

test("tasks bind both upstream artifacts and enforce coverage plus a safe DAG", () => {
  const specResult = validateSpecText(SPEC);
  const planResult = validatePlanText(plan(), specResult);
  assert.deepEqual(validateTasksText(tasks(), specResult, planResult).findings, []);

  const cycle = tasks()
    .replace("- Depends: none", "- Depends: TASK-002")
    .replace("- Files: src/cache.js", "- Files: test/cache.test.js");
  const cycleFindings = validateTasksText(cycle, specResult, planResult).findings;
  assert.ok(cycleFindings.some((f) => f.code === "dependency-cycle"));

  const parallelOverlap = tasks().replace("- Depends: TASK-001", "- Depends: none").replace("- Files: src/cache.js", "- Files: test/cache.test.js");
  assert.ok(validateTasksText(parallelOverlap, specResult, planResult).findings.some((f) => f.code === "parallel-file-overlap"));

  const traversal = tasks().replace("- Files: src/cache.js", "- Files: ../outside.js");
  assert.ok(validateTasksText(traversal, specResult, planResult).findings.some((f) => f.code === "unsafe-task-file"));

  const nestedOverlap = tasks().replace("- Depends: TASK-001", "- Depends: none").replace("- Files: test/cache.test.js", "- Files: src");
  assert.ok(validateTasksText(nestedOverlap, specResult, planResult).findings.some((f) => f.code === "parallel-file-overlap"));

  const dangling = tasks().replace("- Depends: TASK-001", "- Depends: TASK-999");
  assert.ok(validateTasksText(dangling, specResult, planResult).findings.some((f) => f.code === "unknown-dependency"));
});

test("filesystem inspection rejects bad names, oversized artifacts, and symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-artifacts-"));
  const good = join(root, ".specs", "001-cache-refresh");
  mkdirSync(good, { recursive: true });
  writeFileSync(join(good, "spec.md"), SPEC);
  writeFileSync(join(good, "plan.md"), plan());
  writeFileSync(join(good, "tasks.md"), tasks());
  assert.deepEqual(inspectChange(good).findings, []);

  const bad = join(root, ".specs", "cache-refresh");
  mkdirSync(bad, { recursive: true });
  assert.ok(inspectChange(bad).findings.some((f) => f.code === "invalid-change-name"));

  const linked = join(root, ".specs", "002-linked");
  mkdirSync(linked, { recursive: true });
  symlinkSync(join(good, "spec.md"), join(linked, "spec.md"));
  assert.ok(inspectChange(linked).findings.some((f) => f.code === "symlink-artifact"));

  const large = join(root, ".specs", "003-large");
  mkdirSync(large, { recursive: true });
  writeFileSync(join(large, "spec.md"), `# Spec\n${"x".repeat(256 * 1024)}`);
  assert.ok(inspectChange(large).findings.some((f) => f.code === "artifact-too-large"));

  const invalidUtf8 = join(root, ".specs", "004-invalid-utf8");
  mkdirSync(invalidUtf8, { recursive: true });
  writeFileSync(join(invalidUtf8, "spec.md"), Buffer.from([0xc3, 0x28]));
  assert.ok(inspectChange(invalidUtf8).findings.some((f) => f.code === "invalid-utf8"));

  const linkedParent = join(root, ".specs", "005-linked-parent");
  symlinkSync(good, linkedParent);
  assert.ok(inspectChange(linkedParent).findings.some((f) => f.code === "symlink-artifact"));

  const source = join(root, "src");
  mkdirSync(source);
  symlinkSync(source, join(root, "alias"));
  const parallelAlias = tasks().replace("- Depends: TASK-001", "- Depends: none")
    .replace("- Files: test/cache.test.js", "- Files: alias/cache.js");
  const specResult = validateSpecText(SPEC);
  const planResult = validatePlanText(plan(), specResult);
  assert.ok(validateTasksText(parallelAlias, specResult, planResult, root).findings.some((f) => f.code === "unsafe-task-file"));
});

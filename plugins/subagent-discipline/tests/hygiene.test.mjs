import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeReturn,
  formatBlockReason,
  shouldBlock,
} from "../scripts/lib/hygiene.mjs";

test("empty return is hardFail", () => {
  const a = analyzeReturn({ message: "done" });
  assert.equal(a.hardFail, true);
  assert.ok(a.reasons.includes("empty-return"));
});

test("large fence without summary is hardFail dump", () => {
  const body = Array.from({ length: 90 }, (_, i) => `line ${i}`).join("\n");
  const a = analyzeReturn({ message: `\`\`\`\n${body}\n\`\`\`` });
  assert.equal(a.hardFail, true);
  assert.ok(a.reasons.includes("whole-file-dump"));
});

test("citation yields qualityPass without hardFail", () => {
  const a = analyzeReturn({
    message:
      "Login rate limit is missing at src/auth/login.ts:42. Recommend token bucket.",
  });
  assert.equal(a.hardFail, false);
  assert.equal(a.qualityPass, true);
  assert.equal(a.features.D_cite, true);
});

test("plan class without cite is not hardFail when non-empty", () => {
  const a = analyzeReturn({
    message:
      "Proposed approach: extract the validator, add unit tests, then ship behind a flag. No code changes in this pass.",
    taskClass: "plan",
  });
  assert.equal(a.hardFail, false);
});

test("shouldBlock respects mode stop_hook_active and maxAttempts", () => {
  const analysis = analyzeReturn({ message: "ok" });
  assert.equal(shouldBlock("soft", analysis, { attempt: 1, maxAttempts: 2 }), false);
  assert.equal(
    shouldBlock("block", analysis, {
      stopHookActive: false,
      attempt: 1,
      maxAttempts: 2,
    }),
    true,
  );
  assert.equal(
    shouldBlock("block", analysis, {
      stopHookActive: true,
      attempt: 1,
      maxAttempts: 2,
    }),
    false,
  );
  assert.equal(
    shouldBlock("block", analysis, {
      stopHookActive: false,
      attempt: 2,
      maxAttempts: 2,
    }),
    false,
  );
});

test("formatBlockReason mentions Subagent Hygiene", () => {
  const a = analyzeReturn({ message: "x" });
  assert.match(formatBlockReason(a), /Subagent Hygiene/);
});

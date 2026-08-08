import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyMutationPath,
  extractFileTargets,
  mutationScopes,
  shellMutationScopes,
} from "../scripts/lib/mutation-policy.mjs";

test("file mutation targets cover direct, nested, and apply-patch inputs", () => {
  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "Write",
    tool_input: { file_path: "src/app.js" },
  }), ["/workspace/src/app.js"]);

  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "MultiEdit",
    tool_input: { edits: [{ filePath: "tests/app.test.mjs" }, { path: "src/app.mjs" }] },
  }), ["/workspace/tests/app.test.mjs", "/workspace/src/app.mjs"]);

  assert.deepEqual(extractFileTargets({
    cwd: "/workspace",
    tool_name: "apply_patch",
    tool_input: {
      patch: "*** Begin Patch\n*** Update File: tests/app.test.mjs\n*** Move to: tests/value.test.mjs\n*** Update File: src/app.mjs\n*** End Patch",
    },
  }), [
    "/workspace/tests/app.test.mjs",
    "/workspace/tests/value.test.mjs",
    "/workspace/src/app.mjs",
  ]);
});

test("mutation paths classify test, code, non-code, and unknown scopes", () => {
  assert.equal(classifyMutationPath("tests/app.test.mjs"), "test");
  assert.equal(classifyMutationPath("src/app.mjs"), "code");
  assert.equal(classifyMutationPath("reports/result.json"), "non_code");
  assert.equal(classifyMutationPath("docs/design.md"), "non_code");
  assert.equal(classifyMutationPath("package.json"), "unknown");
});

test("mixed patches preserve distinct scopes and custom patterns are reusable", () => {
  const event = {
    cwd: "/workspace",
    tool_name: "apply_patch",
    tool_input: { patch: "*** Update File: tests/app.test.mjs\n*** Update File: src/app.mjs" },
  };
  assert.deepEqual(mutationScopes(event), ["test", "code"]);
  const custom = { nonCodePatterns: [/generated\/schema\.json/gu] };
  assert.equal(classifyMutationPath("generated/schema.json", custom), "non_code");
  assert.equal(classifyMutationPath("generated/schema.json", custom), "non_code");
});

test("shell mutation targets preserve non-code scope and unknown commands fail closed", () => {
  assert.deepEqual(
    shellMutationScopes("mkdir -p reports && printf '%s\\n' data > reports/result.json", "/workspace"),
    ["non_code"],
  );
  assert.deepEqual(shellMutationScopes("touch src/app.js", "/workspace"), ["code"]);
  assert.deepEqual(shellMutationScopes("node scripts/generate.mjs", "/workspace"), ["unknown"]);
});

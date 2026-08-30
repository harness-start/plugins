import assert from "node:assert/strict";
import test from "node:test";

import { BUILTIN_RULES } from "./builtin-rules.js";
import { matchRule } from "./rule-engine.js";

test("raw adb logs require the runtime log sanitizer", () => {
  const hit = matchRule("adb logcat -d", BUILTIN_RULES);
  assert.equal(hit?.id, "runtime-log-raw-output");
  assert.equal(hit?.mode, "deny");
});

test("each runtime log producer requires its own direct sanitizer", () => {
  const hit = matchRule(
    "adb logcat -d; docker logs proxy | node '$PLUGIN_ROOT/dist/cli/harness.mjs' logs sanitize | node '$PLUGIN_ROOT/dist/cli/harness.mjs' logs sanitize",
    BUILTIN_RULES,
  );
  assert.equal(hit?.id, "runtime-log-raw-output");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runHook } from "../../../src/entries/hooks/ci-gated-delivery.ts";

test("hook entry cannot revive the manually activated workflow through SessionStart", () => {
  assert.equal(typeof runHook, "function");
  const source = readFileSync(
    fileURLToPath(new URL("../../../src/entries/hooks/ci-gated-delivery.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(source, /SessionStart|session-start|ciGatedSessionContext/u);
});

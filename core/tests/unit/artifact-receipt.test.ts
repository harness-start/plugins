import assert from "node:assert/strict";
import { test } from "node:test";

import { computeSubjectDigest, receiptOutputsEqual, sha256Hex } from "@harness/core/artifact-receipt";

test("subject digest is stable for the same files and exclude set", () => {
  const digest = computeSubjectDigest({
    files: { "src/a.ts": "one", "dist/out": "skip", "src/b.ts": "two" },
    exclude: (path) => path.startsWith("dist/"),
  });
  assert.equal(digest, computeSubjectDigest({
    files: { "src/b.ts": "two", "src/a.ts": "one", "dist/out": "changed" },
    exclude: (path) => path.startsWith("dist/"),
  }));
  assert.equal(receiptOutputsEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(sha256Hex("x").length, 64);
});

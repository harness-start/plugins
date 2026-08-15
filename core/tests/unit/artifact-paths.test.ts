import assert from "node:assert/strict";
import { test } from "node:test";

import { isKebabArtifactId, projectInside, resolveWorkspaceRoot } from "@harness/core/artifact-paths";

test("projectInside uses path first and falls back to cwd inside an artifact root", () => {
  assert.equal(
    projectInside("artifacts/print/study/dist/out.pdf", "/workspace", "print"),
    "dist/out.pdf",
  );
  assert.equal(
    projectInside("dist/out.pdf", "/workspace/artifacts/print/study", "print"),
    "dist/out.pdf",
  );
  assert.equal(projectInside("README.md", "/workspace", "print"), "");
});

test("resolveWorkspaceRoot walks up from artifacts/<carrier>/<id>", () => {
  assert.equal(
    resolveWorkspaceRoot("/tmp/ws/artifacts/pptx/deck-one/src", "pptx"),
    "/tmp/ws",
  );
  assert.equal(isKebabArtifactId("deck-one"), true);
  assert.equal(isKebabArtifactId("Deck"), false);
});

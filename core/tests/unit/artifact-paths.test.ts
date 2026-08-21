import assert from "node:assert/strict";
import { test } from "node:test";

import { isKebabArtifactId, projectInside, resolveWorkspaceRoot, touchesArtifact } from "@harness/core/artifact-paths";

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

test("touchesArtifact is cwd-or-path scoped and ignores unrelated repo-root work", () => {
  assert.equal(touchesArtifact({
    cwd: "/workspace",
    carrier: "logo",
    command: "rg -n foo README.md",
  }), false);
  assert.equal(touchesArtifact({
    cwd: "/workspace",
    carrier: "logo",
    paths: ["artifacts/logo/mark/plan.contract.json"],
  }), true);
  assert.equal(touchesArtifact({
    cwd: "/workspace/artifacts/logo/mark",
    carrier: "logo",
    command: "sed -n 1,20p README.md",
  }), true);
});

test("resolveWorkspaceRoot walks up from artifacts/<carrier>/<id>", () => {
  assert.equal(
    resolveWorkspaceRoot("/tmp/ws/artifacts/pptx/deck-one/src", "pptx"),
    "/tmp/ws",
  );
  assert.equal(isKebabArtifactId("deck-one"), true);
  assert.equal(isKebabArtifactId("Deck"), false);
});

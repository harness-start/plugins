import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  artifactJournalName,
  isKebabArtifactId,
  markSessionEngagedArtifact,
  projectInside,
  resolveWorkspaceRoot,
  sessionEngagedArtifact,
  touchesArtifact,
} from "@harness/core/artifact-paths";

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

test("sessionEngagedArtifact ignores a stale project at repo root without a journal", () => {
  const root = mkdtempSync(join(tmpdir(), "artifact-unengaged-"));
  const project = join(root, "artifacts", "logo", "mark");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "plan.contract.json"), "{}\n");
  assert.equal(sessionEngagedArtifact({ cwd: root, carrier: "logo" }), false);
  assert.equal(sessionEngagedArtifact({ cwd: project, carrier: "logo" }), true);
});

test("sessionEngagedArtifact treats an open delivery journal as engagement", () => {
  const root = mkdtempSync(join(tmpdir(), "artifact-journal-"));
  const project = join(root, "artifacts", "pptx", "deck");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, artifactJournalName("pptx")), "{}\n");
  assert.equal(sessionEngagedArtifact({ cwd: root, carrier: "pptx" }), true);
});

test("sessionEngagedArtifact recognizes only the matching persisted session marker", () => {
  const root = mkdtempSync(join(tmpdir(), "artifact-session-engaged-"));
  const otherRoot = mkdtempSync(join(tmpdir(), "artifact-session-other-"));
  const dataRoot = join(root, "plugin-data");
  assert.equal(markSessionEngagedArtifact({ cwd: root, carrier: "logo", sessionId: "session-a", dataRoot }), true);
  assert.equal(sessionEngagedArtifact({ cwd: root, carrier: "logo", sessionId: "session-a", dataRoot }), true);
  assert.equal(sessionEngagedArtifact({ cwd: root, carrier: "logo", sessionId: "session-b", dataRoot }), false);
  assert.equal(sessionEngagedArtifact({ cwd: root, carrier: "poster", sessionId: "session-a", dataRoot }), false);
  assert.equal(sessionEngagedArtifact({ cwd: otherRoot, carrier: "logo", sessionId: "session-a", dataRoot }), false);
});

test("resolveWorkspaceRoot walks up from artifacts/<carrier>/<id>", () => {
  assert.equal(
    resolveWorkspaceRoot("/tmp/ws/artifacts/pptx/deck-one/src", "pptx"),
    "/tmp/ws",
  );
  assert.equal(isKebabArtifactId("deck-one"), true);
  assert.equal(isKebabArtifactId("Deck"), false);
});

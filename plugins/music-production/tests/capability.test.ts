import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { consumeMusicWriterCapability, issueMusicWriterCapability } from "../src/lib/capability.js";

test("writer capabilities are session, argv, subject, expiry, and one-shot bound", async () => {
  const parent = await mkdtemp(join(tmpdir(), "music-capability-"));
  const root = join(parent, "artifacts", "music", "study");
  await mkdir(root, { recursive: true });
  const argv = ["/plugin/dist/cli/project-render.mjs", root];
  try {
    const issued = await issueMusicWriterCapability({ root, capability: "music-render", argv, subjectDigest: "a".repeat(64), sessionId: "render-session", triggerFrom: "test" });
    assert.equal((await stat(join(root, ".tmp", "music-guard"))).mode & 0o777, 0o700);
    const consumed = await consumeMusicWriterCapability({ root, capability: "music-render", argv });
    assert.equal(consumed.id, issued.id);
    assert.equal(consumed.sessionId, "render-session");
    await assert.rejects(() => consumeMusicWriterCapability({ root, capability: "music-render", argv }), /WRITER_CAPABILITY_MISSING/u);

    await issueMusicWriterCapability({ root, capability: "music-review", argv, subjectDigest: "b".repeat(64), sessionId: "review-session", triggerFrom: "test" });
    await assert.rejects(() => consumeMusicWriterCapability({ root, capability: "music-review", argv: [...argv, "extra"] }), /WRITER_CAPABILITY_INVALID/u);
    await assert.rejects(() => consumeMusicWriterCapability({ root, capability: "music-review", argv }), /WRITER_CAPABILITY_MISSING/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

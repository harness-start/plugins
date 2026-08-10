import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  sealReport,
  verifyReport,
} from "../scripts/lib/report-integrity.mjs";

test("sealReport appends one SHA-256 marker that verifies the confirmed UTF-8 body", () => {
  const body = "# 工作日报 — 2026-08-10\n\n## 今日完成\n\n- 完成封印设计\n";
  const expected = createHash("sha256").update(body, "utf8").digest("hex");

  const sealed = sealReport(body);

  assert.equal(
    sealed,
    `${body}<!-- work-report-insights:sha256:${expected} -->\n`,
  );
  assert.deepEqual(verifyReport(sealed), {
    ok: true,
    body,
    digest: expected,
    suffix: "\n",
  });
});

test("verifyReport rejects changed, duplicate, and malformed seal markers", () => {
  const sealed = sealReport("body\n");

  assert.equal(verifyReport(sealed.replace("body", "changed")).kind, "mismatch");
  assert.equal(verifyReport(`${sealed}${sealed}`).kind, "malformed");
  assert.equal(
    verifyReport("body\n<!-- work-report-insights:sha256:not-a-digest -->\n").kind,
    "malformed",
  );
});

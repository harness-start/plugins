import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  appendChainV2,
  sealReport,
  verifyReport,
} from "../../../src/domains/reporting/lib/report-integrity.js";

test("sealReport appends one SHA-256 marker that verifies the confirmed UTF-8 body", () => {
  const body = "# 工作日报 — 2026-08-10\n\n## 今日完成\n\n- 完成封印设计\n";
  const expected = createHash("sha256").update(body, "utf8").digest("hex");

  const sealed = sealReport(body);

  assert.equal(
    sealed,
    `${body}<!-- work-reporting:sha256:${expected} -->\n`,
  );
  assert.deepEqual(verifyReport(sealed), {
    ok: true,
    body,
    digest: expected,
    suffix: "\n",
    additions: 0,
    legacySuffixUnverified: false,
  });
});

test("V2 additions authenticate the full previous file and every appended byte", () => {
  const base = sealReport("# report\n");
  const legacy = `${base}\nlegacy suffix\n`;
  const first = appendChainV2(legacy, "\n## Addition\n\nfirst\n");
  const second = appendChainV2(first, "\n## Addition\n\nsecond\n");
  const checked = verifyReport(second);
  assert.equal(checked.ok, true);
  if (checked.ok) {
    assert.equal(checked.additions, 2);
    assert.equal(checked.legacySuffixUnverified, true);
  }
  assert.equal(verifyReport(second.replace("first", "changed")).ok, false);
  assert.equal(verifyReport(second.replace("legacy suffix", "changed suffix")).ok, false);
  assert.equal(verifyReport(`${second}unsealed tail`).ok, false);
});

test("verifyReport rejects changed, duplicate, and malformed seal markers", () => {
  const sealed = sealReport("body\n");

  assert.equal(verifyReport(sealed.replace("body", "changed")).kind, "mismatch");
  assert.equal(verifyReport(`${sealed}${sealed}`).kind, "malformed");
  assert.equal(
    verifyReport("body\n<!-- work-reporting:sha256:not-a-digest -->\n").kind,
    "malformed",
  );
});

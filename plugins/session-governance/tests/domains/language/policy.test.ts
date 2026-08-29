import assert from "node:assert/strict";
import { test } from "node:test";

import { driftBlockReason, sessionContext, toolFeedback } from "../../../src/domains/language/lib/policy.ts";

const finding = { script: "kana", count: 12, ratio: 1 } as const;

test("response and artifact language policies are independent", () => {
  const context = sessionContext("zh-CN", "ja-JP");
  assert.match(context, /profile=zh-CN.*artifact-profile=ja-JP/iu);
  assert.match(context, /response language profile/iu);
  assert.match(context, /generated files.*user or project-owned artifact language/iu);

  const artifactFeedback = toolFeedback("ja-JP", finding);
  assert.match(artifactFeedback, /artifact language profile ja-JP/iu);
  assert.match(artifactFeedback, /correct.*generated file.*Japanese/isu);
  assert.doesNotMatch(artifactFeedback, /previous response/iu);
  assert.match(driftBlockReason("zh-CN", finding), /response language profile zh-CN/iu);
});

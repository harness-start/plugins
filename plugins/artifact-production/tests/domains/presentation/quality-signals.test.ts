import assert from "node:assert/strict";
import test from "node:test";

import {
  deckRiskSignals,
  fingerprintSimilarity,
  headlineRiskSignals,
  textFitSignals,
} from "../../../src/domains/presentation/lib/quality-signals.js";

test("layout similarity preserves repeated-object cardinality", () => {
  assert.equal(
    fingerprintSimilarity(["card", "card", "footer"], ["card", "footer", "footer"]),
    0.5,
  );
});

test("deck signals block repeated payload frames and takeaway strips", () => {
  const storyboard = [
    { role: "opening" },
    { role: "content" },
    { role: "content" },
    { role: "content" },
    { role: "content" },
    { role: "closing" },
  ];
  const composition = [1, 2, 3, 4, 5, 6].map((page) => ({
    page,
    logic: "statement",
    signals: [2, 3, 4].includes(page) ? ["bottom-takeaway-strip"] : [],
  }));
  const signals = deckRiskSignals(
    composition,
    [],
    [{ pages: [2, 3, 4], minimumSimilarity: 0.92 }],
    storyboard,
  );

  assert.deepEqual(
    signals.map(({ id, severity, pages }) => ({ id, severity, pages })),
    [
      { id: "repeated-frame", severity: "blocking", pages: [2, 3, 4] },
      { id: "repeated-bottom-takeaway", severity: "blocking", pages: [2, 3, 4] },
    ],
  );
});

test("three repeated body pages are blocking even in a five-page deck", () => {
  const storyboard = [
    { role: "opening" },
    { role: "content" },
    { role: "content" },
    { role: "content" },
    { role: "closing" },
  ];
  const signals = deckRiskSignals(
    [],
    [],
    [{ pages: [2, 3, 4], minimumSimilarity: 1 }],
    storyboard,
  );

  assert.deepEqual(signals.map(({ id }) => id), ["repeated-frame"]);
});

test("three abstract or formulaic headlines form a blocking chain", () => {
  const headlines = headlineRiskSignals([
    { displayTitle: "能力持续升级" },
    { displayTitle: "从工具到体系" },
    { displayTitle: "价值不断累积" },
    { displayTitle: "部署清单" },
  ]);
  const signals = deckRiskSignals(
    [],
    headlines,
    [],
    Array.from({ length: 4 }, () => ({ role: "content" })),
  );

  assert.deepEqual(signals.find(({ id }) => id === "formulaic-headline-chain")?.pages, [1, 2, 3]);
});

test("text-fit signals report a short automatic final line", () => {
  const signals = textFitSignals([
    {
      index: 1,
      objects: [
        {
          name: "pptx:text:opening:body:detail",
          kind: "rect",
          text: "这是阶段交付说明",
          bounds: { x: 1, y: 2, w: 1, h: 2 },
          fontSizePt: 22,
          lineSpacingMultiple: 1.35,
          marginPt: 0,
        },
      ],
    },
  ]);

  assert.deepEqual(signals.map(({ page, kind, object }) => ({ page, kind, object })), [
    { page: 1, kind: "orphan-line-risk", object: "pptx:text:opening:body:detail" },
  ]);
});

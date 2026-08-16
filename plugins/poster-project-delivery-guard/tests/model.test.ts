import assert from "node:assert/strict";
import test from "node:test";

import {
  POSTER_PROFILES,
  inspectPosterPng,
  inspectPosterSvg,
  validatePosterModel,
} from "../src/lib/contract.js";
import { makePng } from "./fixture.js";

test("publishes the five decision-complete poster profiles", () => {
  assert.deepEqual(POSTER_PROFILES, ["regional-culture", "mondo", "editorial", "academic", "custom"]);
});

test("rejects an unknown closure stage instead of degrading to source", () => {
  const findings = validatePosterModel({ files: {} }, { stage: "ship" });
  assert.deepEqual(findings.map(({ code }) => code), ["STAGE_INVALID"]);
});

test("inspects decoded PNG dimensions and rejects truncated input", () => {
  const png = makePng(2, 3, [1, 2, 3, 0]);
  assert.deepEqual(inspectPosterPng(png), { width: 2, height: 3, alphaCoverage: 0 });
  assert.throws(() => inspectPosterPng(png.subarray(0, 20)), /PNG_INVALID/u);
});

test("inspects a self-contained SVG and rejects executable or remote content", () => {
  assert.deepEqual(
    inspectPosterSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="#fff"/></svg>')),
    { width: 1200, height: 1600, viewBox: [0, 0, 1200, 1600] },
  );
  assert.throws(() => inspectPosterSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), /SVG_UNSAFE/u);
  assert.throws(() => inspectPosterSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>')), /SVG_EXTERNAL_REFERENCE/u);
  assert.throws(() => inspectPosterSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect fill="url(https://example.com/a.svg#paint)"/></svg>')), /SVG_EXTERNAL_REFERENCE/u);
});

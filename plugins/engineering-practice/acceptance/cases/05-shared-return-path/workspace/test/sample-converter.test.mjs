import assert from "node:assert/strict";
import { test } from "node:test";

import { convertSamples } from "../src/sample-converter.mjs";

test("converts both nonempty public call forms", () => {
  assert.deepEqual(convertSamples([[1, 3]], 2), [[3, 1]]);
  const axes = convertSamples([1], [3], 2);
  assert.equal(axes.length, 2);
  assert.ok(axes[0] instanceof Float64Array);
  assert.ok(axes[1] instanceof Float64Array);
  assert.deepEqual([...axes[0]], [3]);
  assert.deepEqual([...axes[1]], [1]);
});

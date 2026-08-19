import assert from "node:assert/strict";
import { test } from "node:test";

import { mapChannels } from "../src/channel-mapper.mjs";

test("maps aligned and singleton nonempty channels", () => {
  const paired = mapChannels([1, 2], [5, 6], 1);
  assert.deepEqual([...paired[0]], [2, 3]);
  assert.deepEqual([...paired[1]], [4, 5]);

  const repeated = mapChannels([2], [8, 9], 2);
  assert.deepEqual([...repeated[0]], [4, 4]);
  assert.deepEqual([...repeated[1]], [6, 7]);
});

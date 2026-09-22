import assert from "node:assert/strict";
import { test } from "node:test";

import { value } from "../src/value.mjs";

test("returns a finite number", () => assert.equal(Number.isFinite(value()), true));

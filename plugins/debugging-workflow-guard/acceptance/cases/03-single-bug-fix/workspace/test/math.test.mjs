import assert from "node:assert/strict";
import { test } from "node:test";
import { double } from "../src/math.js";

test("double multiplies by two", () => assert.equal(double(3), 6));

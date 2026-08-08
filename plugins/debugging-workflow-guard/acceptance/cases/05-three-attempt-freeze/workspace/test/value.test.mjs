import assert from "node:assert/strict";
import { test } from "node:test";
import { value } from "../src/value.js";

test("value is four", () => assert.equal(value, 4));

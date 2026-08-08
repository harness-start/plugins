import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/normalize.js";

test("normalizes a name", () => assert.equal(normalize(" Alice "), "alice"));

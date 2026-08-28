import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/normalize.js";

test("normalizes an email", () => assert.equal(normalize(" A@B.COM "), "a@b.com"));

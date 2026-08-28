import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/formatter.mjs";

test("normalizes text", () => assert.equal(normalize("  HeLLo  "), "hello"));

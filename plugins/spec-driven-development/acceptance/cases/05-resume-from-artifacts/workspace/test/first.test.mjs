import assert from "node:assert/strict";
import { test } from "node:test";
import { firstGreeting } from "../src/first.mjs";

test("first greeting", () => assert.equal(firstGreeting(), "first"));

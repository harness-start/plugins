import assert from "node:assert/strict";
import { test } from "node:test";

import { main as disciplineMain } from "../src/domains/discipline/entries/hooks/execution-discipline.js";
import { main as intentMain } from "../src/domains/intent/entries/hooks/intent-discovery.js";
import { runSessionStart as practiceSession } from "../src/domains/practice/entries/hooks/engineering-practice.js";
import { runSessionStart as reasoningSession } from "../src/domains/reasoning/entries/hooks/reasoning-methods.js";

test("session governance domain Hooks remain import-safe owner handlers", () => {
  for (const handler of [disciplineMain, intentMain, practiceSession, reasoningSession]) {
    assert.equal(typeof handler, "function");
  }
});

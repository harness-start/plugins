import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTaskClass } from "../scripts/lib/task-class.mjs";

test("maps agent types", () => {
  assert.equal(resolveTaskClass("Explore"), "explore");
  assert.equal(resolveTaskClass("worker"), "implement");
  assert.equal(resolveTaskClass("Plan"), "plan");
  assert.equal(resolveTaskClass("custom"), "general");
});

test("agentTypeMap override", () => {
  assert.equal(
    resolveTaskClass("my-reviewer", "", { "my-reviewer": "explore" }),
    "explore",
  );
});

test("brief inference", () => {
  assert.equal(resolveTaskClass("", "please run npm test and report"), "verify");
  assert.equal(resolveTaskClass("", "explore where auth is configured"), "explore");
});

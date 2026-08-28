import assert from "node:assert/strict";
import { test } from "node:test";
import { reasoningMethodsContext } from "../src/session-context.ts";

test("session context routes exact causal decision and factual work to plugin skills", () => {
  const context = reasoningMethodsContext();
  assert.match(context, /reasoning-methods/u);
  assert.match(context, /first-principles/u);
  assert.match(context, /exact|causal|decision|factual/iu);
  assert.doesNotMatch(context, /Stop/u);
  assert.doesNotMatch(context, /skill-deps|vendor-skills|\$HOME\/\.agents\/skills/u);
});

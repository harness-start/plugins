/**
 * ThinkPHP protected paths guard tests (pure unit tests).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "../scripts/checks/protected-paths.mjs";

test("protected: modern runtime/ is denied", () => {
  assert.match(protectedPathViolation("/repo/runtime/log/202401/01.log"), /runtime\//);
  assert.match(protectedPathViolation("/repo/runtime/cache/data.php"), /runtime\//);
});

test("protected: legacy Application/Runtime is denied", () => {
  assert.match(
    protectedPathViolation("/repo/Application/Runtime/Logs/Home/25_01_01.log"),
    /Application\/Runtime/,
  );
});

test("protected: Application source code is allowed", () => {
  assert.equal(protectedPathViolation("/repo/Application/Home/Controller/IndexController.class.php"), null);
});

test("protected: regular source paths are allowed", () => {
  assert.equal(protectedPathViolation("/repo/app/controller/Index.php"), null);
  assert.equal(protectedPathViolation("/repo/config/app.php"), null);
});

test("protected: deny message contains blockingContract", () => {
  const message = protectedPathDenyMessage("/repo/runtime/log/x.log", "generated");
  assert.match(message, /ThinkPHP Protected Path/);
  assert.match(message, /blockingContract/);
  assert.match(message, /unblockWhen/);
  assert.match(message, /recovery/);
});

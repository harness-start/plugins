/**
 * Webman protected paths guard tests (pure unit tests).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "../scripts/checks/protected-paths.mjs";

test("protected: runtime/ logs and pid files are denied", () => {
  assert.match(protectedPathViolation("/repo/runtime/logs/workerman.log"), /runtime\//);
  assert.match(protectedPathViolation("/repo/runtime/webman.pid"), /runtime\//);
  assert.match(protectedPathViolation("/repo/runtime/cache/x.php"), /runtime\//);
});

test("protected: regular source paths are allowed", () => {
  assert.equal(protectedPathViolation("/repo/app/controller/IndexController.php"), null);
  assert.equal(protectedPathViolation("/repo/config/process.php"), null);
  assert.equal(protectedPathViolation("/repo/public/index.php"), null);
  assert.equal(protectedPathViolation("/repo/runtime.md"), null);
});

test("protected: deny message contains blockingContract", () => {
  const message = protectedPathDenyMessage("/repo/runtime/logs/x.log", "generated");
  assert.match(message, /Webman Protected Path/);
  assert.match(message, /blockingContract/);
  assert.match(message, /unblockWhen/);
  assert.match(message, /recovery/);
});

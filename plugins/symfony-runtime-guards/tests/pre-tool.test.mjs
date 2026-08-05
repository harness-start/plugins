/**
 * Symfony protected paths guard tests (pure unit tests).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "../scripts/checks/protected-paths.mjs";

test("protected paths: symfony.lock is denied", () => {
  assert.match(protectedPathViolation("/repo/symfony.lock"), /symfony\.lock/);
});

test("protected paths: var/cache and var/log are denied", () => {
  assert.match(protectedPathViolation("/repo/var/cache/dev/App_KernelDevDebugContainer.php"), /var\/cache/);
  assert.match(protectedPathViolation("/repo/var/log/prod.log"), /var\/log/);
});

test("protected paths: public/build and public/bundles are denied", () => {
  assert.match(protectedPathViolation("/repo/public/build/manifest.json"), /public\/build/);
  assert.match(protectedPathViolation("/repo/public/bundles/framework.js"), /public\/bundles/);
});

test("protected paths: existing migration files are denied", () => {
  assert.match(
    protectedPathViolation("/repo/migrations/Version20240101000000.php"),
    /迁移文件/,
  );
});

test("protected paths: new migration files are allowed (no Version prefix)", () => {
  assert.equal(protectedPathViolation("/repo/migrations/VersionX.php"), null);
  assert.equal(protectedPathViolation("/repo/migrations/20240101_new.php"), null);
});

test("protected paths: regular source files are allowed", () => {
  assert.equal(protectedPathViolation("/repo/src/Controller/HomeController.php"), null);
  assert.equal(protectedPathViolation("/repo/src/Entity/User.php"), null);
  assert.equal(protectedPathViolation("/repo/templates/home/index.html.twig"), null);
});

test("protected paths: deny message contains blockingContract", () => {
  const message = protectedPathDenyMessage("/repo/var/cache/dev/x.php", "generated");
  assert.match(message, /Symfony Protected Path/);
  assert.match(message, /blockingContract/);
  assert.match(message, /unblockWhen/);
  assert.match(message, /recovery/);
  assert.match(message, /composer\/npm/);
});

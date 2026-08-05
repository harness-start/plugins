/**
 * Laravel protected paths guard tests (pure unit tests).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "../scripts/checks/protected-paths.mjs";

test("protected: bootstrap/cache compiled php files are denied", () => {
  assert.match(
    protectedPathViolation("/repo/bootstrap/cache/config.php"),
    /bootstrap\/cache/,
  );
  assert.match(
    protectedPathViolation("/repo/bootstrap/cache/routes-v7.php"),
    /bootstrap\/cache/,
  );
});

test("protected: storage/framework cache and views are denied", () => {
  assert.match(
    protectedPathViolation("/repo/storage/framework/cache/data/x.php"),
    /storage\/framework\/cache/,
  );
  assert.match(
    protectedPathViolation("/repo/storage/framework/views/abcdef.php"),
    /storage\/framework\/views/,
  );
});

test("protected: storage/logs is denied", () => {
  assert.match(protectedPathViolation("/repo/storage/logs/laravel.log"), /storage\/logs/);
});

test("protected: public/build Vite output is denied", () => {
  assert.match(
    protectedPathViolation("/repo/public/build/manifest.json"),
    /public\/build/,
  );
});

test("protected: existing migration files are denied", () => {
  assert.match(
    protectedPathViolation("/repo/database/migrations/2024_01_01_000000_create_users_table.php"),
    /迁移文件/,
  );
});

test("protected: new-style migrations without timestamp prefix are allowed", () => {
  assert.equal(
    protectedPathViolation("/repo/database/migrations/custom_note.sql"),
    null,
  );
});

test("protected: regular source paths are allowed", () => {
  assert.equal(protectedPathViolation("/repo/app/Models/User.php"), null);
  assert.equal(protectedPathViolation("/repo/resources/views/welcome.blade.php"), null);
  assert.equal(protectedPathViolation("/repo/config/app.php"), null);
  assert.equal(protectedPathViolation("/repo/routes/web.php"), null);
});

test("protected: deny message contains blockingContract", () => {
  const message = protectedPathDenyMessage(
    "/repo/bootstrap/cache/config.php",
    "generated",
  );
  assert.match(message, /Laravel Protected Path/);
  assert.match(message, /blockingContract/);
  assert.match(message, /unblockWhen/);
  assert.match(message, /recovery/);
  assert.match(message, /artisan/);
});

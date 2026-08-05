/**
 * laravel-runtime-guards env detection tests (pure unit tests; the entry
 * script's top-level main() is never imported by tests).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SIGNALS,
  shouldInject,
  detectFacts,
  isQuestionOnlyPrompt,
  HOOK_ID,
} from "../scripts/lib/detect.mjs";
import {
  readState,
  writeState,
  clearState,
} from "../scripts/lib/state-store.mjs";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("signals: prompt hitting the framework keyword passes the filter", () => {
  assert.equal(shouldInject("帮我修复这个 laravel 项目的登录问题"), true);
});

test("signals: unrelated prompts are skipped", () => {
  assert.equal(shouldInject("帮我写一个 Python 脚本处理 CSV"), false);
  assert.equal(shouldInject("hi"), false);
  assert.equal(shouldInject("/help"), false);
});

test("signals: question-only prompts without execution verbs are skipped", () => {
  assert.equal(isQuestionOnlyPrompt("什么是 laravel 的路由？"), true);
  assert.equal(shouldInject("什么是 laravel 的路由？"), false);
  assert.equal(shouldInject("怎么修复 laravel 的迁移失败？"), true);
});

test("detect: laravel composer.json yields facts", () => {
  const dir = tempDir("laravel-env-");
  try {
    writeFileSync(join(dir, "composer.json"), JSON.stringify({
      name: "acme/laravel",
      require: {
        php: "^8.2",
        "laravel/framework": "^11.0",
      },
    }));
    const facts = detectFacts(dir);
    assert.ok(facts, "expected facts");
    assert.match(facts, /\[laravel/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detect: non-laravel composer.json yields null", () => {
  const dir = tempDir("laravel-env-");
  try {
    writeFileSync(join(dir, "composer.json"), JSON.stringify({
      name: "acme/other",
      require: { php: "^8.2" },
    }));
    assert.equal(detectFacts(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detect: no composer.json yields null", () => {
  const dir = tempDir("laravel-env-");
  try {
    assert.equal(detectFacts(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cooldown: state store records and suppresses within TTL", () => {
  const dir = tempDir("laravel-state-");
  const oldRoot = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = dir;
  try {
    const session = "s-test";
    const cwd = "/work/laravel";
    clearState(HOOK_ID, session, cwd);
    assert.equal(readState(HOOK_ID, session, cwd), null);
    writeState(HOOK_ID, session, cwd, Date.now());
    const state = readState(HOOK_ID, session, cwd);
    assert.ok(state && typeof state.ts === "number");
    // Simulate the entry logic: a fresh timestamp inside the TTL suppresses.
    const suppressed = state && Date.now() - state.ts < 24 * 60 * 60 * 1000;
    assert.equal(suppressed, true);
  } finally {
    process.env.PLUGIN_DATA = oldRoot;
    rmSync(dir, { recursive: true, force: true });
  }
});

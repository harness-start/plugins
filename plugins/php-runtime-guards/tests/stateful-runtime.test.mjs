import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { environmentContext, heavyCommandDecision, phpstanStop, recordHeavyCommandOutcome, trackPhpstanFile } from "../scripts/checks/stateful-runtime.mjs";

function stateFixture() { const root = mkdtempSync(join(tmpdir(), "php-state-")); const previous = process.env.PLUGIN_DATA; process.env.PLUGIN_DATA = root; return () => { if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous; rmSync(root, { recursive: true, force: true }); }; }

test("PHP environment reports composer constraints", () => {
  const root = mkdtempSync(join(tmpdir(), "php-env-")); const restore = stateFixture();
  try { writeFileSync(join(root, "composer.json"), JSON.stringify({ name: "app/api", require: { php: "^8.4", "symfony/framework-bundle": "^7" }, autoload: { "psr-4": { "App\\\\": "src/" } } })); const context = environmentContext({ cwd: root }); assert.match(context, /\^8\.4/u); assert.match(context, /Symfony/u); }
  finally { restore(); rmSync(root, { recursive: true, force: true }); }
});

test("PHP heavy command escalates repeated failures", () => {
  const restore = stateFixture(), event = { session_id: "retry", cwd: "/work", tool_input: { command: "vendor/bin/phpunit" }, tool_response: { exit_code: 1 } };
  try { recordHeavyCommandOutcome(event); recordHeavyCommandOutcome(event); assert.equal(heavyCommandDecision(event)?.action, "report"); recordHeavyCommandOutcome(event); recordHeavyCommandOutcome(event); assert.equal(heavyCommandDecision(event)?.action, "deny"); }
  finally { restore(); }
});

test("PHP heavy command retry-ok clears the session streak", () => {
  const restore = stateFixture(), event = { session_id: "bypass", cwd: "/work", tool_input: { command: "vendor/bin/phpunit" }, tool_response: { exit_code: 1 } };
  try { recordHeavyCommandOutcome(event); recordHeavyCommandOutcome(event); recordHeavyCommandOutcome({ ...event, tool_input: { command: "vendor/bin/phpunit # retry-ok" } }); assert.equal(heavyCommandDecision(event), null); }
  finally { restore(); }
});

test("PHPStan tracker reports unavailable runtime without installing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "phpstan-state-")); const restore = stateFixture(), previousPath = process.env.PATH; process.env.PATH = "";
  try { writeFileSync(join(root, "composer.json"), "{}\n"); const file = join(root, "App.php"); writeFileSync(file, "<?php\n"); const event = { session_id: "phpstan", cwd: root }; trackPhpstanFile(event, file); const result = await phpstanStop(event); assert.equal(result.action, "report"); assert.match(result.message, /no project-local or PATH PHPStan/u); }
  finally { process.env.PATH = previousPath; restore(); rmSync(root, { recursive: true, force: true }); }
});

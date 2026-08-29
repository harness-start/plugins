import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

test("engineering-workflow is one self-contained owner runtime", () => {
  for (const host of ["claude", "codex"]) {
    assert.ok(existsSync(resolve(root, `.${host}-plugin/plugin.json`)));
    const hooks = JSON.parse(readFileSync(resolve(root, "hooks", `${host}.json`), "utf8"));
    assert.equal(typeof hooks.hooks, "object");
    const routes = JSON.parse(readFileSync(resolve(root, "routes", `${host}.json`), "utf8")) as Record<string, Array<Record<string, unknown>>>;
    for (const entries of Object.values(routes)) {
      for (const route of entries) {
        assert.equal(typeof route.handler, "string");
        assert.equal("module" in route, false);
        assert.equal("script" in route, false);
      }
    }
  }
  assert.equal(existsSync(resolve(root, "modules")), false);
  assert.ok(existsSync(resolve(root, "src/entries/hooks/dispatcher.ts")));
  assert.deepEqual(
    readdirSync(resolve(root, "src/domains"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted(),
    ["debugging", "specification", "testing"],
  );
});

test("engineering-workflow CLI routes invoke owner commands", () => {
  const routes = JSON.parse(readFileSync(resolve(root, "routes/cli.json"), "utf8")) as Record<string, Record<string, Record<string, unknown>>>;
  for (const actions of Object.values(routes)) {
    for (const route of Object.values(actions)) {
      assert.equal(typeof route.handler, "string");
      assert.equal("module" in route, false);
      assert.equal("script" in route, false);
    }
  }
});

test("engineering-workflow dist contains no legacy module subprocess router", () => {
  for (const entry of ["dist/hooks/dispatcher.mjs", "dist/cli/harness.mjs"]) {
    const runtime = readFileSync(resolve(root, entry), "utf8");
    assert.doesNotMatch(runtime, /route\.module/u, entry);
    assert.doesNotMatch(runtime, /spawnSync\(process\.execPath/u, entry);
    assert.doesNotMatch(runtime, /resolve\(root,\s*"modules"/u, entry);
  }
});

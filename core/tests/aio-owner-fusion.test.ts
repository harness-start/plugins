import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const owners = [
  "activity-audit",
  "artifact-production",
  "delivery-governance",
  "engineering-workflow",
  "interface-design",
  "knowledge-work",
  "session-governance",
  "workspace-integrity",
];
const cliOwners = new Set(["artifact-production", "delivery-governance", "knowledge-work"]);

function routeEntries(path: string): Array<Record<string, unknown>> {
  const routes = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const entries: Array<Record<string, unknown>> = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if ("handler" in record || "module" in record || "script" in record) entries.push(record);
    else for (const child of Object.values(record)) visit(child);
  };
  visit(routes);
  return entries;
}

for (const owner of owners) {
  test(`${owner} is one fused owner runtime`, () => {
    const root = resolve(repositoryRoot, "plugins", owner);
    assert.equal(existsSync(resolve(root, "modules")), false);
    assert.ok(existsSync(resolve(root, "src/domains")));
    assert.ok(readdirSync(resolve(root, "src/domains"), { withFileTypes: true })
      .some((entry) => entry.isDirectory()));
    for (const host of ["claude", "codex"]) {
      const entries = routeEntries(resolve(root, "routes", `${host}.json`));
      assert.ok(entries.length > 0);
      for (const route of entries) {
        assert.equal(typeof route.handler, "string");
        assert.equal("module" in route, false);
        assert.equal("script" in route, false);
      }
    }
    if (cliOwners.has(owner)) {
      for (const route of routeEntries(resolve(root, "routes/cli.json"))) {
        assert.equal(typeof route.handler, "string");
        assert.equal("module" in route, false);
        assert.equal("script" in route, false);
      }
    }
  });
}

test("published owners have no legacy module subprocess routing", () => {
  const dispatcher = readFileSync(resolve(repositoryRoot, "core/src/aio-dispatcher.ts"), "utf8");
  const cli = readFileSync(resolve(repositoryRoot, "core/src/aio-cli.ts"), "utf8");
  assert.doesNotMatch(dispatcher, /resolve\(root,\s*"modules"/u);
  assert.doesNotMatch(cli, /resolve\(root,\s*"modules"/u);
});

test("fused domain Hook modules never self-execute when bundled into an owner dispatcher", () => {
  for (const owner of owners) {
    const domainsRoot = resolve(repositoryRoot, "plugins", owner, "src/domains");
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (path.includes("/entries/hooks/") && path.endsWith(".ts")) {
          const source = readFileSync(path, "utf8");
          assert.doesNotMatch(source, /fileURLToPath\(import\.meta\.url\)/u, path);
        }
        if (path.endsWith(".ts") && !path.includes("/entries/cli/")) {
          const source = readFileSync(path, "utf8");
          assert.doesNotMatch(source, /process\.exit\s*\(/u, path);
        }
      }
    };
    visit(domainsRoot);
  }
});

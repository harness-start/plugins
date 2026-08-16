import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));

function text(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function json(path: string) {
  return JSON.parse(text(path));
}

test("publishes a dual-host SessionStart-only engineering mindset plugin", () => {
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");

  assert.equal(claude.name, "engineering-mindset");
  assert.equal(codex.name, claude.name);
  assert.equal(claude.version, "1.0.0");
  assert.equal(codex.version, claude.version);
  assert.equal(codex.interface.displayName, "工程师思维");
  assert.deepEqual(codex.interface.capabilities, ["hooks"]);

  for (const host of ["claude", "codex"]) {
    const hooks = json(`hooks/${host}.json`).hooks;
    assert.deepEqual(Object.keys(hooks), ["SessionStart"]);
    assert.equal(hooks.SessionStart.length, 1);
    assert.equal(hooks.SessionStart[0].hooks.length, 1);
  }

  const codexCommand = json("hooks/codex.json").hooks.SessionStart[0].hooks[0].command;
  assert.match(codexCommand, /AI_EXPERTS_SESSION_ID/u);
  assert.match(codexCommand, /AI_EXPERTS_TRIGGER_FROM="engineering-mindset:session-start"/u);
  assert.match(codexCommand, /\$\{PLUGIN_ROOT\}\/dist\/hooks\/engineering-mindset\.mjs/u);
  assert.equal(
    json("hooks/codex.json").hooks.SessionStart[0].hooks[0].additionalContextLimit,
    2400,
  );
});

test("pins the four reviewed community skill dependencies", () => {
  const dependencies = json("skill-deps.json").skills;
  assert.deepEqual(
    dependencies.map(({ name }: { name: string }) => name),
    [
      "karpathy-guidelines",
      "caveman",
      "systematic-debugging",
      "verification-before-completion",
    ],
  );
  assert.deepEqual(
    Object.fromEntries(dependencies.map(({ name, revision }: { name: string; revision: string }) => [name, revision])),
    {
      "karpathy-guidelines": "64723a49ea6117894304eb491f0d32a60570bf45",
      caveman: "fcf7663366c217dc8f334a11028de52ed950ceab",
      "systematic-debugging": "b36e0829c6d0140e93cfef2ca599b1b07d4a7797",
      "verification-before-completion": "b36e0829c6d0140e93cfef2ca599b1b07d4a7797",
    },
  );
  for (const dependency of dependencies) {
    assert.match(dependency.source, /^https:\/\/github\.com\//u);
    assert.ok(dependency.description.length > 0);
  }
});

test("registers engineering-mindset exactly once in both marketplaces", () => {
  for (const path of [
    join(REPO, ".claude-plugin", "marketplace.json"),
    join(REPO, ".agents", "plugins", "marketplace.json"),
  ]) {
    const marketplace = JSON.parse(readFileSync(path, "utf8"));
    const entries = marketplace.plugins.filter(({ name }: { name: string }) => name === "engineering-mindset");
    assert.equal(entries.length, 1, path);
    if (path.includes(".claude-plugin")) {
      assert.equal(entries[0].source, "./plugins/engineering-mindset");
    } else {
      assert.deepEqual(entries[0].source, {
        source: "local",
        path: "./plugins/engineering-mindset",
      });
      assert.equal(entries[0].category, "Productivity");
    }
  }
});

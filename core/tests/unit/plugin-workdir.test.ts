import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

import {
  PLUGIN_WORKDIR_GITIGNORE,
  ensurePluginWorkdirGitignore,
} from "@harness/core/plugin-workdir";
import { sourceLiterals } from "../support/typescript-source.js";

function workdir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("ensurePluginWorkdirGitignore writes a star ignore for the whole workdir", () => {
  const root = workdir("plugin-workdir-create-");
  ensurePluginWorkdirGitignore(root);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), PLUGIN_WORKDIR_GITIGNORE);
  assert.equal(PLUGIN_WORKDIR_GITIGNORE, "*\n");
});

test("ensurePluginWorkdirGitignore upgrades stale subdirectory templates", () => {
  const root = workdir("plugin-workdir-stale-");
  writeFileSync(join(root, ".gitignore"), "state/\n", "utf8");
  ensurePluginWorkdirGitignore(root);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "*\n");

  writeFileSync(join(root, ".gitignore"), "sessions/\n", "utf8");
  ensurePluginWorkdirGitignore(root);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "*\n");
});

test("ensurePluginWorkdirGitignore leaves a custom workdir gitignore alone", () => {
  const root = workdir("plugin-workdir-custom-");
  writeFileSync(join(root, ".gitignore"), "state/\n!keep.json\n", "utf8");
  ensurePluginWorkdirGitignore(root);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "state/\n!keep.json\n");
});

test("plugin sources do not write subdirectory-only workdir gitignores", async () => {
  const pluginsRoot = resolve(import.meta.dirname, "../../../plugins");
  const leftover: string[] = [];

  async function walk(root: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "tests") continue;
        await walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const text = await readFile(path, "utf8");
      const literals = sourceLiterals(text, path).map(({ value }) => value);
      if (literals.includes("state/\n") || literals.includes("sessions/\n")) {
        leftover.push(relative(resolve(pluginsRoot, ".."), path).split("\\").join("/"));
      }
    }
  }

  await walk(pluginsRoot);
  assert.deepEqual(leftover, []);
});

test("source literal analysis ignores comments and detects actual templates", () => {
  const literals = sourceLiterals([
    "// const ignored = \"state/\\n\";",
    "const active = `sessions/\\n`;",
  ].join("\n"));

  assert.deepEqual(literals.map(({ value }) => value), ["sessions/\n"]);
});

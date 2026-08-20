import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { test } from "node:test";

import { declaredFunctionNames } from "../support/typescript-source.js";

const pluginsRoot = resolve(import.meta.dirname, "../../../plugins");
const forbiddenNames = new Set([
  "readStdinJson",
  "readEvent",
  "tokenizeShell",
  "extractPatchTargets",
]);

// Shrink-only allowlist. Remove a path when that plugin starts importing core.
const allowlist = new Set<string>([]);

async function sourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) found.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}

test("plugin sources do not reimplement core hook I/O outside the shrink-only allowlist", async () => {
  const files = await sourceFiles(pluginsRoot);
  const unexpected: string[] = [];
  for (const file of files) {
    const projectPath = relative(resolve(pluginsRoot, ".."), file).split("\\").join("/");
    const text = await readFile(file, "utf8");
    const declarations = declaredFunctionNames(text, projectPath);
    if (![...forbiddenNames].some((name) => declarations.has(name))) continue;
    if (!allowlist.has(projectPath)) unexpected.push(projectPath);
  }
  assert.deepEqual(unexpected, []);
});

test("function declaration analysis covers declarations and function-valued variables", () => {
  const names = declaredFunctionNames([
    "export async function readEvent() {}",
    "const tokenizeShell = (command: string) => command;",
    "const extractPatchTargets = function () {};",
    "const readStdinJsonAlias = readEvent;",
  ].join("\n"));

  assert.deepEqual(
    [...names].sort(),
    ["extractPatchTargets", "readEvent", "tokenizeShell"],
  );
});

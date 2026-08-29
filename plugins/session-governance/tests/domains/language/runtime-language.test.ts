import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { sourceLiterals } from "../../../../../core/tests/support/typescript-source.js";

const ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const PLUGINS = join(ROOT, "plugins");
const GUARDED_SCRIPTS = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Thai}/u;

function filesUnder(path) {
  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    else files.push(target);
  }
  return files;
}

test("all plugin-generated runtime text is English", () => {
  const unexpected = [];
  for (const file of filesUnder(PLUGINS).filter((path) => path.endsWith(".ts") && path.includes("/src/"))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    for (const literal of sourceLiterals(readFileSync(file, "utf8"), rel)) {
      if (!GUARDED_SCRIPTS.test(literal.value)) continue;
      unexpected.push(`${rel}:${literal.line}: ${JSON.stringify(literal.value)}`);
    }
  }
  assert.deepEqual(unexpected, [], `Non-English runtime text:\n${unexpected.join("\n")}`);
});

test("runtime text analysis ignores detector regular expressions but catches output literals", () => {
  const literals = sourceLiterals([
    "const detector = /中文/u;",
    "const message = `结果: ${value}`;",
  ].join("\n"));

  assert.deepEqual(literals.filter(({ value }) => GUARDED_SCRIPTS.test(value)), [
    { line: 2, value: "结果: " },
  ]);
});

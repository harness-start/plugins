import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PLUGINS = join(ROOT, "plugins");
const GUARDED_SCRIPTS = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Thai}/u;

const DETECTOR_ONLY_LINES = new Map([
  ["plugins/command-safety-guards/src/engines/file-safety.ts", ["const PII =", "const tlsLine ="]],
  ["plugins/git-delivery-guards/src/checks/command-rules.ts", ["const GENERIC ="]],
  ["plugins/intent-clarify-gate/src/lib/policy.ts", ["const IMPLEMENT_CLAIM", "/(?:开始实现"]],
  ["plugins/language-output-governance/src/lib/intent.ts", ["const TRANSLATION_CUE", "const RESPONSE_CUE", "const GENERIC_CHINESE"]],
  ["plugins/language-output-governance/src/lib/profiles.ts", ["aliases:"]],
]);

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
    const allowedMarkers = DETECTOR_ONLY_LINES.get(rel) ?? [];
    for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/u).entries()) {
      if (!GUARDED_SCRIPTS.test(line)) continue;
      if (allowedMarkers.some((marker) => line.includes(marker))) continue;
      unexpected.push(`${rel}:${index + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(unexpected, [], `Non-English runtime text:\n${unexpected.join("\n")}`);
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PLUGINS = join(ROOT, "plugins");
const GUARDED_SCRIPTS = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Thai}/u;

const DETECTOR_ONLY_LINES = new Map([
  ["plugins/command-safety-guards/scripts/engines/file-safety.mjs", ["const PII =", "const tlsLine ="]],
  ["plugins/first-principles-gate/scripts/lib/policy.mjs", ["const IMPLEMENT_CLAIM", "const COMPLETION_CLAIM", "/(?:开始实现", "/(?:第一性原理"]],
  ["plugins/git-delivery-guards/scripts/checks/command-rules.mjs", ["const GENERIC ="]],
  ["plugins/goal-task-gate/scripts/lib/policy.mjs", ["/(?:任务|goal|目标)", "/(?:全部完成"]],
  ["plugins/intent-clarify-gate/scripts/lib/policy.mjs", ["const IMPLEMENT_CLAIM", "/(?:开始实现"]],
  ["plugins/language-output-governance/scripts/lib/intent.mjs", ["const TRANSLATION_CUE", "const RESPONSE_CUE"]],
  ["plugins/language-output-governance/scripts/lib/profiles.mjs", ["aliases:"]],
  ["plugins/subagent-discipline/scripts/lib/hygiene.mjs", ["/\\bgap\\b"]],
  ["plugins/verification-provenance-guard/scripts/lib/claims.mjs", ["const NEGATED", "const VALIDATION", "const CI", "const ARTIFACT", "const GIT"]],
  ["plugins/verification-provenance-guard/scripts/lib/manifest.mjs", ["claim.predicate === \"test_suite_passed\""]],
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
  for (const file of filesUnder(PLUGINS).filter((path) => path.endsWith(".mjs") && path.includes("/scripts/"))) {
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

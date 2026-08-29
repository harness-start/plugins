import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/ios/entries/hooks/domain-hook.js";

const SKILLS = fileURLToPath(new URL("../../../skills", import.meta.url));

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(target) : entry.name.endsWith(".md") ? [target] : [];
  });
}

test("ios-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"ios-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("Podfile.lock")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > Podfile.lock"),["Podfile.lock"]);});
test("ios-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});
test("bundled iOS Skills do not route consumers to unbundled GitHub Skills", () => {
  const externalSkillLinks = markdownFiles(SKILLS).flatMap((file) => {
    const content = readFileSync(file, "utf8");
    return /github\.com\/twostraws\/(?:swiftui|swift-concurrency|swift-testing|swiftdata)-agent-skill/iu.test(content)
      ? [file]
      : [];
  });
  assert.deepEqual(externalSkillLinks, []);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../src/policy.js";
const pluginRoot = resolve(import.meta.dirname, "..");
test("android-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"android-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("gradle.lockfile")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > gradle.lockfile"),["gradle.lockfile"]);});
test("android-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});
test("android-engineering reports Compose source scans without blocking by default",()=>{
  const scans = policy.sourceScans ?? [];
  assert.deepEqual(scans.map((scan)=>scan.id).toSorted(),["composeCollectAsState","composeLiteralColor","composePrimitiveState"]);
  assert.equal(scans.every((scan)=>scan.mode==="report"),true);
  assert.equal(scans.every((scan)=>new RegExp(scan.match.source,scan.match.flags).test("app/src/main/java/Pane.kt")),true);
});
test("android-r8 bundles its quantitative analysis scripts",()=>{
  for (const script of ["convert_pb_to_json.py","analyze.py","keep_radius_pb2.py"]) {
    assert.equal(existsSync(resolve(pluginRoot,"skills/android-r8/scripts",script)),true,script);
  }
  const skill = readFileSync(resolve(pluginRoot,"skills/android-r8/SKILL.md"),"utf8");
  assert.doesNotMatch(skill,/\.agents\/skills|android skills add/u);
  assert.match(skill,/skills\/android-r8\/scripts\/convert_pb_to_json\.py/u);
  const analyzerReference = readFileSync(resolve(pluginRoot,"skills/android-r8/references/CONFIGURATION-ANALYZER.md"),"utf8");
  assert.match(analyzerReference,/skills\/android-r8\/scripts\/convert_pb_to_json\.py/u);
  assert.match(analyzerReference,/skills\/android-r8\/scripts\/analyze\.py/u);
});

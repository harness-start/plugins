import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/android/entries/hooks/domain-hook.js";
test("android-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"android-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("gradle.lockfile")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > gradle.lockfile"),["gradle.lockfile"]);});
test("android-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});
test("android-engineering does not claim the generic JavaScript package manifest",()=>{
  const jsonValidator = policy.validators.find((validator)=>validator.id==="androidJson");
  assert.ok(jsonValidator);
  assert.equal(new RegExp(jsonValidator.match.source,jsonValidator.match.flags).test("package.json"),false);
  assert.equal(new RegExp(jsonValidator.match.source,jsonValidator.match.flags).test("app/google-services.json"),true);
});
test("android-engineering reports Compose source scans without blocking by default",()=>{
  const scans = policy.sourceScans ?? [];
  assert.deepEqual(scans.map((scan)=>scan.id).toSorted(),["composeCollectAsState","composeLiteralColor","composePrimitiveState","r8BroadKeep","r8GlobalDontWarn"]);
  assert.equal(scans.every((scan)=>scan.mode==="report"),true);
  assert.equal(scans.every((scan)=>scan.enforcement==="advisory"),true);
});

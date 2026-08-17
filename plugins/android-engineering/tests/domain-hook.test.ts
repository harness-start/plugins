import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../src/policy.js";
test("android-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"android-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("gradle.lockfile")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > gradle.lockfile"),["gradle.lockfile"]);});
test("android-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});

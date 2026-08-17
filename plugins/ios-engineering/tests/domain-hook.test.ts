import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../src/policy.js";
test("ios-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"ios-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("Podfile.lock")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > Podfile.lock"),["Podfile.lock"]);});
test("ios-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});

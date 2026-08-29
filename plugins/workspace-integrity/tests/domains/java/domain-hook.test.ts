import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/java/entries/hooks/domain-hook.js";
test("java-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"java-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("gradle.lockfile")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > gradle.lockfile"),["gradle.lockfile"]);});
test("java-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});

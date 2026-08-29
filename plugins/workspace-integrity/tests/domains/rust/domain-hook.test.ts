import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/rust/entries/hooks/domain-hook.js";
test("rust-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"rust-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("Cargo.lock")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > Cargo.lock"),["Cargo.lock"]);});
test("rust-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});

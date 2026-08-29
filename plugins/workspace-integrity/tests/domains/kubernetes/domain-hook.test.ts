import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/kubernetes/entries/hooks/domain-hook.js";
test("kubernetes-operations policy and shell targets",()=>{assert.equal(policy.plugin,"kubernetes-operations");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("Chart.lock")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > Chart.lock"),["Chart.lock"]);});
test("kubernetes-operations validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});
test("kubernetes YAML validation requires Kubernetes document evidence",()=>{
  const validator=policy.validators.find((item)=>item.id==="kubernetesDryRun");
  assert.ok(validator?.contentMatch);
  assert.equal(new RegExp(validator.contentMatch.source,validator.contentMatch.flags).test("name: ordinary-config\nvalue: true\n"),false);
  assert.equal(new RegExp(validator.contentMatch.source,validator.contentMatch.flags).test("apiVersion: v1\nkind: ConfigMap\n"),true);
});

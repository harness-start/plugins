import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/react-native/policy.js";
test("react-native-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"react-native-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("NativeComponent.g.h")),true);assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("yarn.lock")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > NativeComponent.g.h"),["NativeComponent.g.h"]);});
test("react-native-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);assert.equal(policy.validators.every(v=>v.enforcement==="deterministic"||v.enforcement==="advisory"),true);});
test("react-native-engineering claims only React Native package targets",()=>{
  const root=mkdtempSync(join(tmpdir(),"react-native-domain-"));
  try {
    mkdirSync(join(root,"src"));
    writeFileSync(join(root,"package.json"),JSON.stringify({dependencies:{"react-native":"latest"}}));
    const context={root,targetPath:join(root,"src/App.tsx"),relativePath:"src/App.tsx"};
    assert.equal(policy.active?.(context),true);
    writeFileSync(join(root,"package.json"),JSON.stringify({dependencies:{react:"latest"}}));
    assert.equal(policy.active?.(context),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

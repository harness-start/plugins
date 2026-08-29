import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractDomainShellWriteTargets } from "@harness/core/domain-engineering-hook";
import { policy } from "../../../src/domains/web/entries/hooks/domain-hook.js";
test("web-frontend-engineering policy and shell targets",()=>{assert.equal(policy.plugin,"web-frontend-engineering");assert.equal(policy.protections.some(rule=>new RegExp(rule.match.source,rule.match.flags).test("yarn.lock")),true);assert.deepEqual(extractDomainShellWriteTargets("printf tampered > yarn.lock"),["yarn.lock"]);});
test("web-frontend-engineering validators are bounded",()=>{assert.ok(policy.validators.length>0);assert.equal(policy.validators.every(v=>v.mode==="block"||v.mode==="report"),true);});
test("web-frontend-engineering yields React Native package targets",()=>{
  const root=mkdtempSync(join(tmpdir(),"web-domain-"));
  try {
    mkdirSync(join(root,"src"));
    writeFileSync(join(root,"package.json"),JSON.stringify({dependencies:{"react-native":"latest"}}));
    assert.equal(policy.active?.({root,targetPath:join(root,"src/App.tsx"),relativePath:"src/App.tsx"}),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { domainTargetsNeedPhase, type DomainEngineeringPolicy } from "@harness/core/domain-engineering-hook";

const policy: DomainEngineeringPolicy = {
  plugin: "go-engineering",
  displayName: "Go Engineering",
  protections: [{
    id: "go-module-checksums",
    match: /(?:^|\/)go\.sum$/iu,
    reason: "go.sum is generated",
    recovery: "regenerate",
  }],
  validators: [{ id: "gofmt", kind: "gofmt", match: /\.go$/iu, mode: "report" }],
};

test("domain pre work is limited to protected generated paths", () => {
  assert.equal(domainTargetsNeedPhase(policy, ["/repo/README.md"], "pre"), false);
  assert.equal(domainTargetsNeedPhase(policy, ["/repo/go.sum"], "pre"), true);
});

test("domain post work is limited to matching validators", () => {
  assert.equal(domainTargetsNeedPhase(policy, ["/repo/README.md"], "post"), false);
  assert.equal(domainTargetsNeedPhase(policy, ["/repo/internal/sum.go"], "post"), true);
});

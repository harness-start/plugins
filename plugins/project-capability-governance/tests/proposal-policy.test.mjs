import assert from "node:assert/strict";
import { test } from "node:test";

import { validateProposalDocument } from "../scripts/lib/proposals.mjs";

function candidate({
  id = "pc-release-check",
  kind = "sop",
  extraFrontmatter = [],
  evidence = ["run A", "run B"],
  reuse = ["service release", "library release"],
  extraSections = [],
} = {}) {
  return [
    "---",
    `proposal_id: ${id}`,
    "proposal_revision: 1",
    `kind: ${kind}`,
    "title: Release verification",
    "status: pending",
    ...extraFrontmatter,
    "---",
    "",
    "## Evidence",
    "",
    ...evidence.map((value) => `- ${value}`),
    "",
    "## Reuse scenarios",
    "",
    ...reuse.map((value) => `- ${value}`),
    "",
    "## Acceptance",
    "",
    "- outcome-level command succeeds",
    "",
    "## Counterexample",
    "",
    "- a one-off deployment does not qualify",
    "",
    ...extraSections,
  ].join("\n");
}

test("proposal policy rejects one-off SOP evidence and accepts explicit standardization", () => {
  const oneOff = candidate({ evidence: ["one deployment"], reuse: ["same deployment"] });
  assert.equal(
    validateProposalDocument(oneOff, "pc-release-check.md").ok,
    false,
  );

  const explicit = candidate({
    evidence: ["human requested a standing rule"],
    extraFrontmatter: ["explicit_standardization: true"],
  });
  assert.equal(
    validateProposalDocument(explicit, "pc-release-check.md").ok,
    true,
  );
});

test("Hook proposals require risk and an outcome causal chain", () => {
  const incomplete = candidate({ kind: "hook" });
  assert.equal(
    validateProposalDocument(incomplete, "pc-release-check.md").ok,
    false,
  );

  const complete = candidate({
    kind: "hook",
    extraFrontmatter: ["risk: ordinary"],
    extraSections: [
      "## Event", "", "PreToolUse file mutation", "",
      "## Predicate", "", "Target resolves outside the allowed root", "",
      "## Harm", "", "Project data can be overwritten", "",
      "## Recovery", "", "Deny and return the exact offending target", "",
      "## Near miss", "", "A write inside the allowed root remains permitted", "",
    ],
  });
  assert.equal(
    validateProposalDocument(complete, "pc-release-check.md").ok,
    true,
  );
});

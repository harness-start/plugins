import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractEvidenceBlock,
  parseEvidenceManifest,
  removeEvidenceAndClaimLines,
  validateVisibleClaims,
} from "../scripts/lib/manifest.mjs";

function manifest(overrides = {}) {
  return {
    schema: "verification-evidence/v1",
    completion: "done",
    claims: [{
      id: "C1",
      predicate: "test_suite_passed",
      status: "verified",
      statement: "Unit tests passed: 15/15.",
      evidence: ["E1"],
    }],
    evidence: [{
      id: "E1",
      kind: "command",
      command: "node --test tests/*.test.mjs",
      exitCode: 0,
      summary: { passed: 15, failed: 0 },
    }],
    ...overrides,
  };
}

function response(value = manifest()) {
  return [
    "## Conclusions",
    "",
    "- [C1][locally-verified] Unit tests passed: 15/15.",
    "",
    "```verification-evidence",
    JSON.stringify(value, null, 2),
    "```",
  ].join("\n");
}

test("extracts exactly one bounded evidence block", () => {
  const block = extractEvidenceBlock(response(), { maxBytes: 32 * 1024 });
  assert.equal(block.present, true);
  assert.match(block.raw, /verification-evidence\/v1/u);
  assert.throws(() => extractEvidenceBlock(`${response()}\n${response()}`), /exactly one/u);
  assert.throws(() => extractEvidenceBlock(`\`\`\`verification-evidence\n${"x".repeat(128)}\n\`\`\`` , { maxBytes: 64 }), /maximum/u);
});

test("claim-line removal honors configured manifest size limits", () => {
  const padding = "x".repeat(33 * 1024);
  const value = response({
    ...manifest(),
    claims: [{ ...manifest().claims[0], statement: padding }],
  });
  assert.doesNotThrow(() => removeEvidenceAndClaimLines(value, { maxBytes: 64 * 1024 }));
});

test("strict parser rejects duplicate keys and unknown fields", () => {
  const duplicate = '{"schema":"verification-evidence/v1","schema":"verification-evidence/v1","completion":"done","claims":[],"evidence":[]}';
  assert.throws(() => parseEvidenceManifest(duplicate), /duplicate key/u);
  assert.throws(() => parseEvidenceManifest(JSON.stringify({ ...manifest(), surprise: true })), /unknown field/u);
});

test("schema rejects duplicate IDs, dangling references, and verified other claims", () => {
  const duplicateEvidence = manifest({ evidence: [manifest().evidence[0], manifest().evidence[0]] });
  assert.throws(() => parseEvidenceManifest(JSON.stringify(duplicateEvidence)), /duplicate evidence id/u);

  const dangling = manifest({ claims: [{ ...manifest().claims[0], evidence: ["E9"] }] });
  assert.throws(() => parseEvidenceManifest(JSON.stringify(dangling)), /unknown evidence/u);

  const unverifiable = manifest({ claims: [{ ...manifest().claims[0], predicate: "other" }] });
  assert.throws(() => parseEvidenceManifest(JSON.stringify(unverifiable)), /cannot be verified/u);
});

test("done cannot contain inferred or unverified claims", () => {
  const inferred = manifest({
    claims: [{
      id: "C1",
      predicate: "other",
      status: "inferred",
      statement: "The implementation should meet the requirements.",
      basis: "The code is consistent with the test results.",
    }],
    evidence: [],
  });
  assert.throws(() => parseEvidenceManifest(JSON.stringify(inferred)), /done_with_concerns/u);
  assert.doesNotThrow(() => parseEvidenceManifest(JSON.stringify({ ...inferred, completion: "done_with_concerns" })));
});

test("numeric test claims require summary and every evidence item must be referenced", () => {
  const noSummary = manifest({ evidence: [{ id: "E1", kind: "command", command: "node --test", exitCode: 0 }] });
  assert.throws(() => parseEvidenceManifest(JSON.stringify(noSummary)), /structured summary/u);
  const orphan = manifest({ evidence: [...manifest().evidence, { id: "E2", kind: "command", command: "npm run lint", exitCode: 0 }] });
  assert.throws(() => parseEvidenceManifest(JSON.stringify(orphan)), /unreferenced evidence/u);
});

test("visible claims must be one-line, unique, tagged, and statement-exact", () => {
  const parsed = parseEvidenceManifest(JSON.stringify(manifest()));
  assert.doesNotThrow(() => validateVisibleClaims(response(), parsed));
  assert.throws(() => validateVisibleClaims(response().replace("15/15", "14/15"), parsed), /does not match/u);
  assert.throws(() => validateVisibleClaims(response().replace("[locally-verified]", "[remote-ci]"), parsed), /tag/u);
  assert.throws(() => validateVisibleClaims(response().replace("## Conclusions", "- [C1][locally-verified] Unit tests passed: 15/15."), parsed), /exactly once/u);
});

test("confusable claim identifiers are not accepted", () => {
  const parsed = parseEvidenceManifest(JSON.stringify(manifest()));
  assert.throws(() => validateVisibleClaims(response().replace("[C1]", "[Ｃ1]"), parsed), /missing visible claim/u);
});

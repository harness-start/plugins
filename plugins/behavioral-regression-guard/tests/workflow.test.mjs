import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  bindIndependentReviewer,
  bindContractAfterMutation,
  completionFindings,
  independentReviewChallengeDrafts,
  observeCommand,
  observeIndependentReview,
  observeIndependentReviewerAnchor,
  refreshBinding,
  reserveIndependentReview,
} from "../scripts/lib/workflow.mjs";
import { coupledBoundaryContract, homogeneousNeutralityContract, regressionContract, witnessedOrderingContract } from "./fixtures.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "behavioral-workflow-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, ".behavioral-regression"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "normalize.js"), "export const normalize = value => value;\n");
  for (const name of ["primary", "boundary", "representation", "compat"]) {
    writeFileSync(join(root, "test", `${name}.mjs`), `// ${name}\n`);
  }
  const path = join(root, ".behavioral-regression", "BR-20260809-normalize.json");
  writeFileSync(path, `${JSON.stringify(regressionContract(), null, 2)}\n`);
  return { root, data, path };
}

function withData(data, callback) {
  const prior = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = data;
  try { return callback(); }
  finally {
    if (prior === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = prior;
  }
}

function bind(fx, sessionId = "session-a") {
  return withData(fx.data, () => bindContractAfterMutation({
    cwd: fx.root,
    sessionId,
    touchedPaths: [fx.path],
  }));
}

test("no contract mutation is an exact no-op and a valid mutation activates", () => {
  const fx = fixture();
  assert.deepEqual(withData(fx.data, () => bindContractAfterMutation({ cwd: fx.root, sessionId: "s", touchedPaths: [] })), { kind: "idle" });
  const active = bind(fx);
  assert.equal(active.kind, "bound");
  assert.equal(active.contract.id, "BR-20260809-normalize");
});

test("review drafts label machine values and qualitative descriptions explicitly", () => {
  const representation = regressionContract();
  representation.surface.inputShape = "variadic";
  const qualitative = independentReviewChallengeDrafts(representation, "oracle", "src/normalize.js");
  assert.ok(qualitative.length > 0);
  assert.ok(qualitative.every((item) => item.valueMode === "qualitative-string-12..1000"));

  const ordering = regressionContract();
  ordering.surface.semantics = ["ordering"];
  const machine = independentReviewChallengeDrafts(ordering, "oracle", "src/normalize.js");
  assert.ok(machine.length > 0);
  assert.ok(machine.every((item) => item.valueMode === "raw-json"));
  const patchMachine = independentReviewChallengeDrafts(ordering, "patch", "src/normalize.js");
  assert.ok(patchMachine.every((item) => item.observedActual === null));

  const cycleAware = independentReviewChallengeDrafts(witnessedOrderingContract(), "oracle", "src/channel-map.cjs");
  assert.equal(cycleAware.some((item) => item.id === "ordering.genuine-cycle"), false);

  const homogeneousContract = homogeneousNeutralityContract();
  homogeneousContract.surface.compositionDepth = "three-or-more";
  const homogeneous = independentReviewChallengeDrafts(homogeneousContract, "oracle", "src/channel-map.cjs");
  assert.deepEqual(homogeneous.map((item) => item.id), [
    "representation.homogeneous-neutrality",
    "composition.direct-many",
  ]);
  assert.ok(homogeneous.every((item) => item.valueMode === "raw-json"));
  assert.equal(homogeneous[0].oraclePolicy, "homogeneous-neutrality");
  assert.equal(homogeneous[1].oraclePolicy, "homogeneous-neutrality");
  assert.deepEqual(homogeneous[0].input, {
    populated: { value: [2], representation: "array:length=1" },
    degenerate: { value: [], representation: "array:length=0" },
  });
  assert.deepEqual(homogeneous[1].input, {
    contributors: [
      { value: [], representation: "array:length=0" },
      { value: [2], representation: "array:length=1" },
      { value: [], representation: "array:length=0" },
    ],
  });

  const coupledContract = coupledBoundaryContract();
  const coupled = independentReviewChallengeDrafts(coupledContract, "oracle", "src/channel-map.cjs");
  assert.deepEqual(coupled.map((item) => item.id), ["representation.coupled-boundary"]);
  assert.equal(coupled[0].valueMode, "raw-json");
  assert.equal(coupled[0].oraclePolicy, "coupled-boundary");
  assert.match(coupled[0].representationGrammar, /canonical descriptor.*container:length=<n>.*items=container:length=<n>.*Python.*bracket comprehension.*list.*JSON value.*mirror.*length/iu);
  assert.equal(coupled[0].valueShape, "object{representation:string,value:array}");
  assert.equal(coupled[0].contrastValueShape, "object{representation:string,value:null}");
  const coupledPatch = independentReviewChallengeDrafts(coupledContract, "patch", "src/channel-map.cjs");
  assert.equal(coupledPatch[0].observedValueShape, "object{representation:string,value:array}");
  assert.equal(coupledPatch[0].contrastValueShape, "object{representation:string,value:null}");
  assert.deepEqual(coupled[0].input, coupledContract.cases[0].componentSamples);
  assert.equal(coupled.some((item) => item.id.startsWith("representation.partial-")), false);
  assert.equal(coupled.some((item) => item.id === "multi-component.asymmetric"), false);
});

test("qualitative review challenges reject raw arrays with an actionable type finding", () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.surface.inputShape = "variadic";
  contract.cases[1].coverage.push("arity-zero", "arity-one", "arity-two", "arity-many");
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);

  withData(fx.data, () => {
    const sessionId = "qualitative-review";
    const bound = bindContractAfterMutation({ cwd: fx.root, sessionId, touchedPaths: [fx.path], reviewMode: "hard" });
    assert.equal(bound.kind, "bound", bound.findings?.join("\n"));
    for (const [index, [command, outcome, output]] of [
      ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
      ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
      ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
      ["node test/compat.mjs", "success", "COMPAT_OK"],
    ].entries()) {
      const observed = observeCommand({ cwd: fx.root, sessionId, command, outcome, output });
      contract.cases[index].receipts.before = observed.receipts[0].id;
    }
    writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
    bindContractAfterMutation({ cwd: fx.root, sessionId, touchedPaths: [fx.path], reviewMode: "hard" });
    reserveIndependentReview({ cwd: fx.root, sessionId, contractId: contract.id, stage: "oracle", toolUseId: "qualitative-tool" });
    const reviewer = bindIndependentReviewer({ cwd: fx.root, sessionId, contractId: contract.id, stage: "oracle", agentId: "qualitative-reviewer" });
    observeIndependentReviewerAnchor({ cwd: fx.root, sessionId, agentId: "qualitative-reviewer", path: join(fx.root, "src", "normalize.js") });
    const invalid = observeIndependentReview({
      cwd: fx.root,
      sessionId,
      agentId: "qualitative-reviewer",
      result: {
        contractId: contract.id,
        stage: "oracle",
        reviewNonce: reviewer.reservation.nonce,
        decision: "approve",
        checkedDimensions: ["representation"],
        checkedChallenges: ["representation.partial-left", "representation.partial-right", "representation.zero-dimension-shape"],
        challengeResults: ["representation.partial-left", "representation.partial-right", "representation.zero-dimension-shape"].map((id) => ({
          id,
          input: ["left", "right"],
          derivedExpected: ["preserved"],
          rejectedAlternative: ["dropped"],
          disposition: "contract-conforms",
          evidenceAnchor: "src/normalize.js",
        })),
        counterexamples: ["degenerate one side while preserving the populated peer"],
        evidenceAnchors: ["src/normalize.js"],
      },
    });
    assert.equal(invalid.kind, "rejected");
    assert.match(invalid.reason, /valueMode qualitative-string-12\.\.1000.*descriptive JSON string.*not an array or object/iu);
  });
});

test("coupled-boundary oracle review does not require a hidden author-selected contrast label", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-coupled-review-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-coupled-review-data-"));
  const contract = coupledBoundaryContract();
  mkdirSync(join(root, ".behavioral-regression", contract.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels([2]);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const primary = contract.cases.find((item) => item.oracle.coupledBoundary);
  const coupled = primary.oracle.coupledBoundary;
  coupled.rejectedAlternative = { representation: "array:length=0", value: [] };
  writeFileSync(join(root, primary.proofPath), [
    "function emitCoupledBoundaryWitness() {}",
    contract.surface.publicLocator,
    contract.surface.constraintLocator,
    coupled.invocationLocator,
    coupled.witnessLocator,
    "",
  ].join("\n"));
  const path = join(root, ".behavioral-regression", `${contract.id}.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);

  withData(data, () => {
    const sessionId = "coupled-review";
    const bound = bindContractAfterMutation({ cwd: root, sessionId, touchedPaths: [path], reviewMode: "hard" });
    assert.equal(bound.kind, "bound", bound.findings?.join("\n"));
    for (const item of contract.cases) {
      const observed = observeCommand({
        cwd: root,
        sessionId,
        command: item.command,
        outcome: item.before.outcome,
        output: item.before.includes.join("\n"),
      });
      assert.equal(observed.kind, "recorded", observed.reason);
      item.receipts.before = observed.receipts.find((receipt) => receipt.caseId === item.id).id;
    }
    writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
    bindContractAfterMutation({ cwd: root, sessionId, touchedPaths: [path], reviewMode: "hard" });
    reserveIndependentReview({ cwd: root, sessionId, contractId: contract.id, stage: "oracle", toolUseId: "coupled-review-tool" });
    const reviewer = bindIndependentReviewer({ cwd: root, sessionId, contractId: contract.id, stage: "oracle", agentId: "coupled-reviewer" });
    for (const evidencePath of contract.scope.productionPaths.concat(contract.scope.regressionPaths)) {
      observeIndependentReviewerAnchor({ cwd: root, sessionId, agentId: "coupled-reviewer", path: join(root, evidencePath) });
    }
    const reviewBase = {
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: reviewer.reservation.nonce,
      decision: "approve",
      checkedDimensions: ["representation", "multi-component"],
      checkedChallenges: ["representation.coupled-boundary"],
      counterexamples: ["the legacy seam raises before returning the coupled empty result"],
      evidenceAnchors: contract.scope.productionPaths.concat(contract.scope.regressionPaths),
    };
    const inconsistent = observeIndependentReview({
      cwd: root,
      sessionId,
      agentId: "coupled-reviewer",
      result: {
        ...reviewBase,
        challengeResults: [{
          id: "representation.coupled-boundary",
          input: primary.componentSamples,
          derivedExpected: coupled.expectedSample,
          rejectedAlternative: {
            representation: "tuple:length=2;items=array:length=0",
            value: [[]],
          },
          disposition: "contract-conforms",
          evidenceAnchor: contract.scope.productionPaths[0],
        }],
      },
    });
    assert.equal(inconsistent.kind, "rejected");
    assert.match(inconsistent.reason, /representationGrammar.*descriptor.*JSON value.*length/iu);

    const reviewed = observeIndependentReview({
      cwd: root,
      sessionId,
      agentId: "coupled-reviewer",
      result: {
        ...reviewBase,
        challengeResults: [{
          id: "representation.coupled-boundary",
          input: primary.componentSamples,
          derivedExpected: coupled.expectedSample,
          rejectedAlternative: {
            representation: "tuple:length=1;items=array:length=0",
            value: [[]],
          },
          disposition: "contract-conforms",
          evidenceAnchor: contract.scope.productionPaths[0],
        }],
      },
    });
    assert.equal(reviewed.kind, "review-recorded", reviewed.reason);
  });
});

test("ordering reviewer approval requires independently derived challenge results", () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.surface.semantics = ["ordering"];
  contract.cases[1].coverage.push("independent-order", "shared-order", "conflict-order");
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);

  withData(fx.data, () => {
    const bound = bindContractAfterMutation({
      cwd: fx.root,
      sessionId: "ordering-review",
      touchedPaths: [fx.path],
      reviewMode: "hard",
    });
    assert.equal(bound.kind, "bound", bound.findings?.join("\n"));
    for (const [index, [command, outcome, output]] of [
      ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
      ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
      ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
      ["node test/compat.mjs", "success", "COMPAT_OK"],
    ].entries()) {
      const observed = observeCommand({ cwd: fx.root, sessionId: "ordering-review", command, outcome, output });
      contract.cases[index].receipts.before = observed.receipts[0].id;
    }
    writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
    bindContractAfterMutation({ cwd: fx.root, sessionId: "ordering-review", touchedPaths: [fx.path], reviewMode: "hard" });

    const reserved = reserveIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      contractId: contract.id,
      stage: "oracle",
      toolUseId: "review-tool",
    });
    assert.equal(reserved.kind, "reserved", reserved.reason);
    const reviewer = bindIndependentReviewer({
      cwd: fx.root,
      sessionId: "ordering-review",
      contractId: contract.id,
      stage: "oracle",
      agentId: "ordering-reviewer",
    });
    assert.equal(reviewer.kind, "bound-reviewer", reviewer.reason);
    observeIndependentReviewerAnchor({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      path: join(fx.root, "src", "normalize.js"),
    });

    const base = {
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: reviewer.reservation.nonce,
      decision: "approve",
      checkedDimensions: ["ordering"],
      checkedChallenges: ["ordering.independent-pair", "ordering.independent-chains"],
      counterexamples: ["compare eager release with an atomic ready layer"],
      evidenceAnchors: ["src/normalize.js"],
    };
    const copiedIdsOnly = observeIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      result: base,
    });
    assert.equal(copiedIdsOnly.kind, "rejected");
    assert.match(copiedIdsOnly.reason, /challengeResults.*independently derived/iu);

    const wrongOracle = observeIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      result: {
        ...base,
        challengeResults: [
          {
            id: "ordering.independent-pair",
            input: [[1, 2], [3, 4]],
            derivedExpected: [1, 2, 3, 4],
            rejectedAlternative: [1, 2, 3, 4],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
          {
            id: "ordering.independent-chains",
            input: [[1, 2, 7], [3, 4], [5, 6]],
            derivedExpected: [1, 3, 5, 2, 4, 6, 7],
            rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
        ],
      },
    });
    assert.equal(wrongOracle.kind, "rejected");
    assert.match(wrongOracle.reason, /ordering\.independent-pair.*derivedExpected/u);
    assert.match(wrongOracle.reason, /does not equal the frozen contract oracle.*keep.*derivedExpected.*contract-conflicts.*decision challenge.*do not guess.*hidden/iu);

    const baselineMisclassifiedAsContractConflict = observeIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      result: {
        ...base,
        decision: "challenge",
        challengeResults: [
          {
            id: "ordering.independent-pair",
            input: [[1, 2], [3, 4]],
            derivedExpected: [1, 3, 2, 4],
            rejectedAlternative: [1, 2, 3, 4],
            disposition: "contract-conflicts",
            evidenceAnchor: "src/normalize.js",
          },
          {
            id: "ordering.independent-chains",
            input: [[1, 2, 7], [3, 4], [5, 6]],
            derivedExpected: [1, 3, 5, 2, 4, 6, 7],
            rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
        ],
      },
    });
    assert.equal(baselineMisclassifiedAsContractConflict.kind, "rejected");
    assert.match(
      baselineMisclassifiedAsContractConflict.reason,
      /derivedExpected matches the contract oracle.*use disposition contract-conforms.*known baseline implementation/iu,
    );

    const narratedOracle = observeIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      result: {
        ...base,
        challengeResults: [
          {
            id: "ordering.independent-pair",
            input: [[1, 2], [3, 4]],
            derivedExpected: "the layered result is [1, 3, 2, 4]",
            rejectedAlternative: "the eager result is [1, 2, 3, 4]",
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
          {
            id: "ordering.independent-chains",
            input: [[1, 2, 7], [3, 4], [5, 6]],
            derivedExpected: [1, 3, 5, 2, 4, 6, 7],
            rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
        ],
      },
    });
    assert.equal(narratedOracle.kind, "rejected");
    assert.match(narratedOracle.reason, /raw JSON value.*valueShape array-of-numbers.*no prose/iu);

    const wrongAlternative = observeIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      result: {
        ...base,
        challengeResults: [
          {
            id: "ordering.independent-pair",
            input: [[1, 2], [3, 4]],
            derivedExpected: [1, 3, 2, 4],
            rejectedAlternative: [1, 3, 2, 4],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
          {
            id: "ordering.independent-chains",
            input: [[1, 2, 7], [3, 4], [5, 6]],
            derivedExpected: [1, 3, 5, 2, 4, 6, 7],
            rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
        ],
      },
    });
    assert.equal(wrongAlternative.kind, "rejected");
    assert.match(wrongAlternative.reason, /ordering\.independent-pair.*rejectedAlternative/u);

    const reviewed = observeIndependentReview({
      cwd: fx.root,
      sessionId: "ordering-review",
      agentId: "ordering-reviewer",
      result: {
        ...base,
        challengeResults: [
          {
            id: "ordering.independent-pair",
            input: [[1, 2], [3, 4]],
            derivedExpected: [1, 3, 2, 4],
            rejectedAlternative: [1, 2, 3, 4],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
          {
            id: "ordering.independent-chains",
            input: [[1, 2, 7], [3, 4], [5, 6]],
            derivedExpected: [1, 3, 5, 2, 4, 6, 7],
            rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
        ],
      },
    });
    assert.equal(reviewed.kind, "review-recorded", reviewed.reason);
    assert.match(reviewed.receipt.challengeDigest, /^[a-f0-9]{64}$/u);
  });
});

test("oracle reviewer can record a structured challenge to a frozen machine oracle", () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.surface.semantics = ["ordering"];
  contract.cases[1].coverage.push("independent-order", "shared-order", "conflict-order");
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);

  withData(fx.data, () => {
    const sessionId = "ordering-challenge";
    const bound = bindContractAfterMutation({
      cwd: fx.root,
      sessionId,
      touchedPaths: [fx.path],
      reviewMode: "hard",
    });
    assert.equal(bound.kind, "bound", bound.findings?.join("\n"));
    for (const [index, [command, outcome, output]] of [
      ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
      ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
      ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
      ["node test/compat.mjs", "success", "COMPAT_OK"],
    ].entries()) {
      const observed = observeCommand({ cwd: fx.root, sessionId, command, outcome, output });
      contract.cases[index].receipts.before = observed.receipts[0].id;
    }
    writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
    bindContractAfterMutation({ cwd: fx.root, sessionId, touchedPaths: [fx.path], reviewMode: "hard" });
    const reserved = reserveIndependentReview({
      cwd: fx.root,
      sessionId,
      contractId: contract.id,
      stage: "oracle",
      toolUseId: "review-challenge-tool",
    });
    assert.equal(reserved.kind, "reserved", reserved.reason);
    const reviewer = bindIndependentReviewer({
      cwd: fx.root,
      sessionId,
      contractId: contract.id,
      stage: "oracle",
      agentId: "oracle-challenger",
    });
    assert.equal(reviewer.kind, "bound-reviewer", reviewer.reason);
    observeIndependentReviewerAnchor({
      cwd: fx.root,
      sessionId,
      agentId: "oracle-challenger",
      path: join(fx.root, "src", "normalize.js"),
    });

    const challenged = observeIndependentReview({
      cwd: fx.root,
      sessionId,
      agentId: "oracle-challenger",
      result: {
        contractId: contract.id,
        stage: "oracle",
        reviewNonce: reviewer.reservation.nonce,
        decision: "challenge",
        checkedDimensions: ["ordering"],
        checkedChallenges: ["ordering.independent-pair", "ordering.independent-chains"],
        challengeResults: [
          {
            id: "ordering.independent-pair",
            input: [[1, 2], [3, 4]],
            derivedExpected: [1, 2, 3],
            rejectedAlternative: [9],
            disposition: "contract-conflicts",
            evidenceAnchor: "src/normalize.js",
          },
          {
            id: "ordering.independent-chains",
            input: [[1, 2, 7], [3, 4], [5, 6]],
            derivedExpected: [1, 3, 5, 2, 4, 6, 7],
            rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
            disposition: "contract-conforms",
            evidenceAnchor: "src/normalize.js",
          },
        ],
        counterexamples: ["the independent pair follows the baseline concatenation policy"],
        evidenceAnchors: ["src/normalize.js"],
      },
    });
    assert.equal(challenged.kind, "review-recorded", challenged.reason);
    assert.equal(challenged.receipt.decision, "challenge");
  });
});

test("BEFORE receipts require unchanged production and literal expected output", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    const wrongText = observeCommand({
      cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs",
      outcome: "failure", output: "generic assertion failed",
    });
    assert.equal(wrongText.kind, "ignored");

    const receipt = observeCommand({
      cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs",
      outcome: "failure", output: "PRIMARY_REPRO: legacy input rejected",
    });
    assert.equal(receipt.kind, "recorded");
    assert.equal(receipt.receipts[0].phase, "before");

    writeFileSync(join(fx.root, "src", "normalize.js"), "export const normalize = () => 'changed';\n");
    const late = observeCommand({
      cwd: fx.root, sessionId: "session-a", command: "node test/representation.mjs",
      outcome: "failure", output: "REPRESENTATION_REPRO",
    });
    assert.equal(late.kind, "rejected");
    assert.match(late.reason, /before.*production change/ui);
  });
});

test("verification weakening invalidates receipts and stale green cannot close", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    const baseline = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    assert.equal(baseline.kind, "recorded");
    writeFileSync(join(fx.root, "test", "primary.mjs"), "// weakened\n");
    const invalid = refreshBinding({ cwd: fx.root, sessionId: "session-a" });
    assert.equal(invalid.kind, "invalid");
    assert.match(invalid.findings.join("\n"), /verification assets changed/u);
  });

  const stale = fixture();
  bind(stale);
  withData(stale.data, () => {
    for (const [command, outcome, output] of [
      ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
      ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
      ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
      ["node test/compat.mjs", "success", "COMPAT_OK"],
    ]) observeCommand({ cwd: stale.root, sessionId: "session-a", command, outcome, output });
    writeFileSync(join(stale.root, "src", "normalize.js"), "export const normalize = value => String(value);\n");
    for (const [command, output] of [
      ["node test/primary.mjs", "PRIMARY_FIXED"],
      ["node test/boundary.mjs", "BOUNDARY_OK"],
      ["node test/representation.mjs", "REPRESENTATION_FIXED"],
      ["node test/compat.mjs", "COMPAT_OK"],
    ]) observeCommand({ cwd: stale.root, sessionId: "session-a", command, outcome: "success", output });

    let contract = regressionContract();
    const live = refreshBinding({ cwd: stale.root, sessionId: "session-a" });
    for (const item of contract.cases) {
      const receipts = live.run.receipts.filter((receipt) => receipt.caseId === item.id);
      item.receipts.before = receipts.find((receipt) => receipt.phase === "before")?.id ?? null;
      item.receipts.after = receipts.find((receipt) => receipt.phase === "after")?.id ?? null;
    }
    contract.status = "closed";
    writeFileSync(stale.path, `${JSON.stringify(contract, null, 2)}\n`);
    assert.deepEqual(completionFindings(refreshBinding({ cwd: stale.root, sessionId: "session-a" })), []);

    writeFileSync(join(stale.root, "src", "normalize.js"), "export const normalize = () => 'later edit';\n");
    assert.match(completionFindings(refreshBinding({ cwd: stale.root, sessionId: "session-a" })).join("\n"), /stale AFTER/u);
  });
});

test("plan edits reset BEFORE before production change and are rejected afterward", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    const revised = regressionContract();
    revised.problem.actual = "legacy input throws a typed error";
    writeFileSync(fx.path, `${JSON.stringify(revised, null, 2)}\n`);
    const reset = bindContractAfterMutation({ cwd: fx.root, sessionId: "session-a", touchedPaths: [fx.path] });
    assert.equal(reset.kind, "replanned");
    assert.equal(reset.run.receipts.length, 0);

    writeFileSync(join(fx.root, "src", "normalize.js"), "export const normalize = value => String(value);\n");
    revised.problem.actual = "another changed claim";
    writeFileSync(fx.path, `${JSON.stringify(revised, null, 2)}\n`);
    const rejected = bindContractAfterMutation({ cwd: fx.root, sessionId: "session-a", touchedPaths: [fx.path] });
    assert.equal(rejected.kind, "invalid");
    assert.match(rejected.findings.join("\n"), /revert production.*replan/u);
  });
});

test("timeouts, unknown results, and cross-case receipt references never prove closure", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    for (const outcome of ["timeout", "unknown"]) {
      const result = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome, output: "PRIMARY_REPRO" });
      assert.equal(result.kind, "ignored");
    }
    const contract = regressionContract();
    contract.status = "closed";
    contract.cases[0].receipts = { before: "BR-R999", after: "BR-R999" };
    writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
    assert.match(completionFindings(refreshBinding({ cwd: fx.root, sessionId: "session-a" })).join("\n"), /missing or forged/u);
  });
});

test("same direct command can prove multiple cases only when every signature matches", () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.cases[2].command = contract.cases[0].command;
  contract.cases[2].before.includes = ["REPRESENTATION_REPRO"];
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  bind(fx);
  withData(fx.data, () => {
    const partial = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    assert.deepEqual(partial.receipts.map((item) => item.caseId), ["BR-C1"]);
    const combined = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO REPRESENTATION_REPRO" });
    assert.deepEqual(combined.receipts.map((item) => item.caseId), ["BR-C1", "BR-C3"]);
  });
});

test("homogeneous-neutrality AFTER receipt requires all three observed results", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-neutrality-workflow-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-neutrality-data-"));
  const contract = homogeneousNeutralityContract();
  mkdirSync(join(root, ".behavioral-regression", contract.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels.filter((item) => item.length); }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels([2]);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const primary = contract.cases.find((item) => item.oracle.neutrality);
  const neutrality = primary.oracle.neutrality;
  writeFileSync(join(root, primary.proofPath), [
    contract.surface.publicLocator,
    contract.surface.constraintLocator,
    neutrality.singleInvocationLocator,
    neutrality.leftInvocationLocator,
    neutrality.rightInvocationLocator,
    neutrality.witnessLocator,
    "",
  ].join("\n"));
  const path = join(root, ".behavioral-regression", `${contract.id}.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);

  withData(data, () => {
    const bound = bindContractAfterMutation({ cwd: root, sessionId: "neutrality", touchedPaths: [path] });
    assert.equal(bound.kind, "bound", bound.findings?.join("\n"));
    const before = observeCommand({
      cwd: root,
      sessionId: "neutrality",
      command: primary.command,
      outcome: "failure",
      output: primary.before.includes.join("\n"),
    });
    assert.equal(before.kind, "recorded");
    writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels.filter((item) => item.length); }\n// repaired\n");
    const base = primary.after.includes.join("\n");
    const wrong = observeCommand({
      cwd: root,
      sessionId: "neutrality",
      command: primary.command,
      outcome: "success",
      output: `${base}\n${neutrality.marker} ${JSON.stringify({ populated: neutrality.populatedSample, degenerate: neutrality.degenerateSample, single: neutrality.expectedSample, left: { value: [], representation: "array:length=0" }, right: neutrality.expectedSample })}`,
    });
    assert.equal(wrong.kind, "rejected");
    assert.match(wrong.reason, /neutrality witness.*left.*actual.*array:length=0.*expected.*array:length=1/u);

    const valid = observeCommand({
      cwd: root,
      sessionId: "neutrality",
      command: primary.command,
      outcome: "success",
      output: `${base}\n${neutrality.marker} ${JSON.stringify({ populated: neutrality.populatedSample, degenerate: neutrality.degenerateSample, single: neutrality.expectedSample, left: neutrality.expectedSample, right: neutrality.expectedSample })}`,
    });
    assert.equal(valid.kind, "recorded", valid.reason);
  });
});

test("coupled-boundary AFTER receipt requires the declared component inputs and same-call result", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-coupled-workflow-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-coupled-data-"));
  const contract = coupledBoundaryContract();
  mkdirSync(join(root, ".behavioral-regression", contract.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels([2]);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const primary = contract.cases.find((item) => item.oracle.coupledBoundary);
  const proof = primary.oracle.coupledBoundary;
  writeFileSync(join(root, primary.proofPath), [
    "function emitCoupledBoundaryWitness() {}",
    contract.surface.publicLocator,
    contract.surface.constraintLocator,
    proof.invocationLocator,
    proof.witnessLocator,
    "",
  ].join("\n"));
  const path = join(root, ".behavioral-regression", `${contract.id}.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);

  withData(data, () => {
    const bound = bindContractAfterMutation({ cwd: root, sessionId: "coupled", touchedPaths: [path] });
    assert.equal(bound.kind, "bound", bound.findings?.join("\n"));
    const before = observeCommand({
      cwd: root,
      sessionId: "coupled",
      command: primary.command,
      outcome: "failure",
      output: primary.before.includes.join("\n"),
    });
    assert.equal(before.kind, "recorded");
    writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n// repaired\n");
    const base = primary.after.includes.join("\n");
    const wrong = observeCommand({
      cwd: root,
      sessionId: "coupled",
      command: primary.command,
      outcome: "success",
      output: `${base}\n${proof.marker} ${JSON.stringify({ components: primary.componentSamples, actual: proof.rejectedAlternative })}`,
    });
    assert.equal(wrong.kind, "rejected");
    assert.match(wrong.reason, /coupled-boundary witness.*actual.*error.*expected.*tuple:length=2/u);

    const valid = observeCommand({
      cwd: root,
      sessionId: "coupled",
      command: primary.command,
      outcome: "success",
      output: `${base}\n${proof.marker} ${JSON.stringify({ components: primary.componentSamples, actual: proof.expectedSample })}`,
    });
    assert.equal(valid.kind, "recorded", valid.reason);
  });
});

test("a live lease rejects a second session and higher epoch resumes with BEFORE only", () => {
  const fx = fixture();
  bind(fx, "session-a");
  withData(fx.data, () => {
    observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    assert.equal(bindContractAfterMutation({ cwd: fx.root, sessionId: "session-b", touchedPaths: [fx.path] }).kind, "conflict");

    const paused = regressionContract();
    paused.status = "paused";
    writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
    bindContractAfterMutation({ cwd: fx.root, sessionId: "session-a", touchedPaths: [fx.path] });

    paused.status = "open";
    paused.epoch = 2;
    writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
    const resumed = bindContractAfterMutation({ cwd: fx.root, sessionId: "session-b", touchedPaths: [fx.path] });
    assert.equal(resumed.kind, "resumed");
    assert.equal(resumed.run.receipts.length, 1);
    assert.equal(resumed.run.receipts[0].phase, "before");
  });
});

test("paused or aborted status cannot release a changed production tree", () => {
  for (const status of ["paused", "aborted"]) {
    const fx = fixture();
    bind(fx);
    writeFileSync(join(fx.root, "src", "normalize.js"), "export const normalize = () => 'changed';\n");
    const contract = regressionContract();
    contract.status = status;
    writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
    withData(fx.data, () => bindContractAfterMutation({
      cwd: fx.root,
      sessionId: "session-a",
      touchedPaths: [fx.path],
    }));

    assert.match(
      withData(fx.data, () => completionFindings(refreshBinding({ cwd: fx.root, sessionId: "session-a" }))).join("\n"),
      /cannot pause or abort after production changed/u,
    );
  }
});

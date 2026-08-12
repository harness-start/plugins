import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadContract, planDigest, validateContract } from "../scripts/lib/contract.mjs";
import { fingerprintPaths } from "../scripts/lib/fingerprint.mjs";
import {
  coupledBoundaryContract,
  homogeneousNeutralityContract,
  oracleBoundOrderingContract,
  regressionContract,
  sourceBoundVariadicContract,
  witnessedOrderingContract,
  witnessedRelationContract,
} from "./fixtures.mjs";

function profiledContract({ inputShape = "single", semantics = [], coverage = [] } = {}) {
  const value = regressionContract();
  value.schema = "behavioral-regression/v3";
  value.surface = {
    publicSeam: "normalize(value)",
    constraintSeam: "normalize(value)",
    inputShape,
    compositionDepth: "single",
    semantics,
    preserves: ["return representation", "existing supported inputs"],
  };
  const baseCoverage = [["primary", "public-seam", "constraint-seam"], ["boundary"], ["alternate-representation"], ["compatibility"]];
  for (const [index, item] of value.cases.entries()) item.coverage = [...baseCoverage[index], ...(coverage[index] ?? [])];
  return value;
}

function evidenceBoundContract({ inputShape = "single", components = [], compositionDepth = "single", semantics = [], coverage = [] } = {}) {
  const value = profiledContract({ inputShape, semantics, coverage });
  value.schema = "behavioral-regression/v4";
  value.surface.publicLocator = "normalize(";
  value.surface.constraintLocator = "normalize(";
  value.surface.components = components;
  value.surface.compositionDepth = compositionDepth;
  value.surface.repairMode = compositionDepth === "three-or-more" ? "extend-existing-seam" : "preserve-existing-seam";
  for (const [index, item] of value.cases.entries()) {
    item.proofPath = value.scope.verificationPaths[index];
    item.oracle = {
      kind: item.role === "invariant" ? "compatibility" : "exact",
      assertions: [`observable assertion for ${item.id}`],
    };
    item.degenerateComponents = [];
    item.preservedComponents = [];
  }
  return value;
}

function callFormContract({ inputShape = "single", components = [], callForms } = {}) {
  const value = evidenceBoundContract({ inputShape, components });
  value.schema = "behavioral-regression/v6";
  value.surface.callForms = callForms ?? [{
    seam: "public",
    name: "one-value",
    locator: "normalize(",
    dataComponents: ["value"],
    controlInputs: [],
    variadic: false,
  }, {
    seam: "constraint",
    name: "one-value",
    locator: "normalize(",
    dataComponents: ["value"],
    controlInputs: [],
    variadic: false,
  }];
  for (const item of value.cases) {
    item.proofPath = `.behavioral-regression/${value.id}/${item.proofPath.split("/").at(-1)}`;
    item.oracle.relations = [];
  }
  value.scope.verificationPaths = value.scope.verificationPaths.map((path) => `.behavioral-regression/${value.id}/${path.split("/").at(-1)}`);
  return value;
}

test("v6 derives multi-component input shape and binds preserved-peer identity relations", () => {
  const value = callFormContract({
    inputShape: "multi-component",
    components: ["horizontal", "vertical"],
    callForms: [{
      seam: "public", name: "per-channel", locator: "transform(",
      dataComponents: ["horizontal", "vertical"], controlInputs: ["origin"], variadic: false,
    }, {
      seam: "public", name: "matrix", locator: "transform(",
      dataComponents: ["coordinate-matrix"], controlInputs: ["origin"], variadic: false,
    }, {
      seam: "constraint", name: "per-channel", locator: "convert(",
      dataComponents: ["horizontal", "vertical"], controlInputs: ["origin"], variadic: false,
    }],
  });
  value.surface.publicLocator = "transform(";
  value.surface.constraintLocator = "convert(";
  const coverage = [["all-populated"], ["all-degenerate", "each-one-degenerate"], ["each-one-degenerate"], []];
  for (const [index, tokens] of coverage.entries()) value.cases[index].coverage.push(...tokens);
  value.cases[1].degenerateComponents = ["horizontal"];
  value.cases[1].preservedComponents = ["vertical"];
  value.cases[1].oracle = {
    kind: "relational",
    assertions: ["degenerate output stays empty", "populated peer stays mapped"],
    relations: [{ sourceComponent: "vertical", targetObservation: "output.vertical", kind: "value-and-representation", marker: "BR_RELATION_C2_VERTICAL" }],
  };
  value.cases[1].after.includes.push("BR_RELATION_C2_VERTICAL");
  value.cases[2].degenerateComponents = ["vertical"];
  value.cases[2].preservedComponents = ["horizontal"];
  value.cases[2].oracle = {
    kind: "relational",
    assertions: ["degenerate output stays empty", "populated peer stays mapped"],
    relations: [{ sourceComponent: "horizontal", targetObservation: "output.horizontal", kind: "value-and-representation", marker: "BR_RELATION_C3_HORIZONTAL" }],
  };
  value.cases[2].after.includes.push("BR_RELATION_C3_HORIZONTAL");
  const allDegenerate = structuredClone(value.cases[1]);
  allDegenerate.id = "BR-C5";
  allDegenerate.coverage = ["all-degenerate"];
  allDegenerate.degenerateComponents = ["horizontal", "vertical"];
  allDegenerate.preservedComponents = [];
  allDegenerate.oracle = { kind: "exact", assertions: ["all components remain degenerate"], relations: [] };
  allDegenerate.command = "node .behavioral-regression/BR-20260809-normalize/all-degenerate.mjs";
  allDegenerate.proofPath = ".behavioral-regression/BR-20260809-normalize/all-degenerate.mjs";
  value.scope.verificationPaths.push(allDegenerate.proofPath);
  value.cases.push(allDegenerate);
  assert.deepEqual(validateContract(value).findings, []);

  const labelOnly = structuredClone(value);
  labelOnly.cases[1].oracle.relations = [];
  assert.match(validateContract(labelOnly).findings.join("\n"), /preserved peer vertical.*value-and-representation relation/u);

  const unobservedRelation = structuredClone(value);
  unobservedRelation.cases[1].after.includes = unobservedRelation.cases[1].after.includes.filter((literal) => literal !== "BR_RELATION_C2_VERTICAL");
  assert.match(validateContract(unobservedRelation).findings.join("\n"), /relation marker.*AFTER includes/u);

  const misclassified = structuredClone(value);
  misclassified.surface.inputShape = "single";
  misclassified.surface.components = [];
  for (const item of misclassified.cases) {
    item.degenerateComponents = [];
    item.preservedComponents = [];
  }
  assert.match(validateContract(misclassified).findings.join("\n"), /inputShape.*multi-component.*callForms/u);
});

test("v6 proof paths are isolated under the contract directory", () => {
  const value = callFormContract();
  assert.deepEqual(validateContract(value).findings, []);

  value.cases[0].proofPath = "test/primary.mjs";
  value.scope.verificationPaths.push("test/primary.mjs");
  assert.match(validateContract(value).findings.join("\n"), /proofPath.*\.behavioral-regression.*contract id/u);
});

test("v8 binds preserved peers to a consistent component-sample matrix plus a direct witness", () => {
  const value = witnessedRelationContract();
  assert.deepEqual(validateContract(value).findings, []);

  const transformedSource = structuredClone(value);
  transformedSource.cases[0].oracle.relations[0].sourceSample = { value: [], representation: "array:length=0" };
  assert.match(validateContract(transformedSource).findings.join("\n"), /sourceSample.*non-degenerate/u);

  const aggregateEmpty = structuredClone(value);
  aggregateEmpty.cases[0].oracle.relations[0].targetSample = { value: [], representation: "array:length=0" };
  assert.match(validateContract(aggregateEmpty).findings.join("\n"), /targetSample.*non-degenerate/u);

  const indirect = structuredClone(value);
  indirect.cases[0].oracle.relations[0].witnessLocator = "emitRelationWitness(marker, broadcastRight, outputRight)";
  assert.match(validateContract(indirect).findings.join("\n"), /witnessLocator.*marker.*sourceComponent.*targetObservation/u);

  const substitutedDegenerate = structuredClone(value);
  substitutedDegenerate.cases[0].componentSamples.left = { value: [10], representation: "array:length=1" };
  assert.match(validateContract(substitutedDegenerate).findings.join("\n"), /degenerate sample.*left.*all-degenerate/u);

  const detachedSource = structuredClone(value);
  detachedSource.cases[0].oracle.relations[0].sourceSample = { value: [9], representation: "array:length=1" };
  assert.match(validateContract(detachedSource).findings.join("\n"), /sourceSample.*componentSamples.*right/u);
});

test("v8 binds the constraint locator to a pre-existing production source operation", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-constraint-source-"));
  const value = witnessedRelationContract();
  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  for (const item of value.cases) {
    const proof = [value.surface.publicLocator, value.surface.constraintLocator, ...(item.oracle.relations ?? []).map((relation) => relation.witnessLocator)];
    writeFileSync(join(root, item.proofPath), `${proof.join("\n")}\n`);
  }
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  value.surface.constraintSeam = "future helper";
  value.surface.constraintLocator = "mergeFuture(";
  for (const form of value.surface.callForms.filter((form) => form.seam === "constraint")) form.locator = "mergeFuture(";
  for (const item of value.cases) if (item.coverage.includes("constraint-seam")) {
    writeFileSync(join(root, item.proofPath), `mapChannels(\nmergeFuture(\n${(item.oracle.relations ?? []).map((relation) => relation.witnessLocator).join("\n")}\n`);
  }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /constraintLocator.*pre-existing.*constraintSourcePath/u);

  value.surface.constraintLocator = "._resolved";
  for (const form of value.surface.callForms.filter((form) => form.seam === "constraint")) form.locator = "._resolved";
  value.surface.compositionDepth = "three-or-more";
  value.surface.repairMode = "extend-existing-seam";
  assert.match(validateContract(value).findings.join("\n"), /three-or-more.*constraintLocator.*callable/u);
});

test("v8 ordering semantics require structurally valid adversarial scenarios", () => {
  const value = witnessedOrderingContract();
  assert.deepEqual(validateContract(value).findings, []);

  const missing = structuredClone(value);
  missing.cases[3].oracle.scenarios = missing.cases[3].oracle.scenarios.filter((scenario) => scenario.kind !== "shared-suffix");
  assert.match(validateContract(missing).findings.join("\n"), /ordering scenarios.*shared-suffix/u);

  const fakePrefix = structuredClone(value);
  fakePrefix.cases[3].oracle.scenarios.find((scenario) => scenario.kind === "shared-prefix").contributors = [[1, 2], [3, 4], [5, 6]];
  assert.match(validateContract(fakePrefix).findings.join("\n"), /shared-prefix.*common first/u);

  const silentCycle = structuredClone(value);
  silentCycle.cases[3].oracle.scenarios.find((scenario) => scenario.kind === "genuine-cycle").expected.diagnostics = [];
  assert.match(validateContract(silentCycle).findings.join("\n"), /genuine-cycle.*diagnostic/u);
});

test("v9 rejects a variadic source signature disguised as a fixed conceptual input", () => {
  const value = sourceBoundVariadicContract();
  assert.deepEqual(validateContract(value).findings, []);

  for (const form of value.surface.callForms) {
    form.variadic = false;
    form.dataComponents = ["coordinates"];
  }
  value.surface.inputShape = "single";
  value.surface.components = [];
  for (const item of value.cases) {
    item.componentSamples = {};
    item.degenerateComponents = [];
    item.preservedComponents = [];
    item.oracle.relations = [];
  }

  assert.match(validateContract(value).findings.join("\n"), /signatureLocator.*variadic|variadic.*source signature/u);
});

test("v10 load derives variadic shape from the complete source signature, not a truncated locator", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-source-signature-"));
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  value.surface.publicSeam = "project_points(*args)";
  value.surface.publicLocator = "project_points(";
  value.surface.constraintSeam = "project_points(*args)";
  value.surface.constraintLocator = "project_points(";
  value.surface.constraintSourcePath = "src/project_points.py";
  value.surface.inputShape = "single";
  value.surface.components = [];
  for (const form of value.surface.callForms) {
    form.locator = "project_points(";
    form.dataComponents = ["coords"];
    form.variadic = false;
    form.sourcePath = "src/project_points.py";
    form.signatureLocator = "def project_points(self, coords)";
  }
  value.scope.productionPaths = ["src/project_points.py"];
  value.scope.regressionPaths = ["test/test_project_points.py"];
  for (const item of value.cases) {
    item.componentSamples = {};
    item.degenerateComponents = [];
    item.preservedComponents = [];
    item.oracle.relations = [];
    if (item.role === "invariant") item.protectedPaths = ["test/test_project_points.py"];
  }

  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "project_points.py"), [
    "# def project_points(self, coords): this documentation is not the declaration",
    "def project_points(",
    "        self, *args, **kwargs):",
    "    return args",
    "",
  ].join("\n"));
  writeFileSync(join(root, "test", "test_project_points.py"), "project_points([], [], 0)\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/project_points.py", "test/test_project_points.py"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const proof = `${value.surface.publicLocator}\n${value.surface.constraintLocator}\n`;
  writeFileSync(join(root, value.scope.verificationPaths[0]), proof);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

  assert.match(
    loadContract(path).findings.join("\n"),
    /actual source declaration.*variadic.*variadic must be true/u,
  );

  for (const form of value.surface.callForms) form.signatureLocator = "def project_points";
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(join(root, "src", "project_points.py"), "def project_points(self, **kwargs):\n    return kwargs\n");
  assert.deepEqual(loadContract(path).findings, []);
  writeFileSync(join(root, "src", "project_points.py"), "def project_points(self, *, mode=None):\n    return mode\n");
  assert.deepEqual(loadContract(path).findings, []);

  writeFileSync(join(root, "src", "project_points.py"), "def project_points(self, coords):\n    return coords\n");
  for (const form of value.surface.callForms) form.signatureLocator = "def project_points(self, coords):";
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /canonical.*def project_points\(self, coords\).*omit.*trailing.*colon/iu,
  );
});

test("extend-existing-seam keeps a frozen baseline signature locator valid across intended variadic evolution", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-signature-evolution-"));
  const value = sourceBoundVariadicContract();
  value.surface.repairMode = "extend-existing-seam";
  for (const form of value.surface.callForms) form.signatureLocator = "function mapChannels(left, right)";

  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(left, right) { return [left, right]; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels([1], [2]);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const proof = value.cases.flatMap((item) => [
    value.surface.publicLocator,
    value.surface.constraintLocator,
    ...(item.oracle.relations ?? []).map((relation) => relation.witnessLocator),
  ]).join("\n");
  writeFileSync(join(root, value.scope.verificationPaths[0]), `${proof}\n`);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  assert.deepEqual(loadContract(path).findings, []);

  const inventedBaseline = structuredClone(value);
  for (const form of inventedBaseline.surface.callForms) form.signatureLocator = "function mapChannels(oldLeft, oldRight)";
  writeFileSync(path, `${JSON.stringify(inventedBaseline, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /signatureLocator.*Git baseline/u);

  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(join(root, "src", "channel-map.cjs"), "function wrapper() {\n  function mapChannels(...channels) { return channels; }\n  return mapChannels;\n}\n");
  assert.match(loadContract(path).findings.join("\n"), /declaration nesting.*Git baseline/u);

  const preserved = structuredClone(value);
  preserved.surface.repairMode = "preserve-existing-seam";
  writeFileSync(path, `${JSON.stringify(preserved, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /signatureLocator must exist in sourcePath|declaration nesting/u);
});

test("extend-existing-seam requires one target variadic shape for every form of the same callable", () => {
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  value.surface.repairMode = "extend-existing-seam";
  for (const form of value.surface.callForms) form.signatureLocator = "function mapChannels(left, right)";
  value.surface.callForms[0].variadic = false;
  value.surface.callForms[1].variadic = true;

  assert.match(
    validateContract(value).findings.join("\n"),
    /same callable.*target variadic shape|all call forms.*variadic true/u,
  );
});

test("v10 call form cannot bind a seam to a nested helper signature", () => {
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  value.surface.constraintSeam = "_array_converter(*args)";
  value.surface.constraintLocator = "_array_converter(";
  for (const form of value.surface.callForms.filter((item) => item.seam === "constraint")) {
    form.locator = "_array_converter(";
    form.signatureLocator = "def _return_list_of_arrays(axes, origin)";
  }

  assert.match(
    validateContract(value).findings.join("\n"),
    /signatureLocator.*_array_converter.*same callable/u,
  );
});

test("v9 variadic representation seams require the asymmetric two-slot matrix", () => {
  const value = sourceBoundVariadicContract();
  assert.deepEqual(validateContract(value).findings, []);

  value.surface.callForms[0].name = "packed channel table";
  value.surface.callForms[0].dataComponents = ["channel-table"];
  assert.deepEqual(validateContract(value).findings, []);

  const collapsed = structuredClone(value);
  collapsed.cases = collapsed.cases.filter((item) => item.degenerateComponents?.[0] !== "channel-1");
  assert.match(validateContract(collapsed).findings.join("\n"), /separate relational case.*channel-1.*preserve.*channel-0/u);
});

test("v9 accepts semantic names as supplementary coverage labels", () => {
  const value = sourceBoundVariadicContract();
  value.surface.semantics = ["representation", "composition"];
  value.cases[0].coverage.push("representation", "composition", "composed-operation");
  assert.deepEqual(validateContract(value).findings, []);
});

test("v10 derives non-optional ordering and representation semantics from behavioral claims", () => {
  const ordering = oracleBoundOrderingContract();
  ordering.schema = "behavioral-regression/v10";
  ordering.problem.expected = "contributors retain stable dependency order";
  ordering.surface.preserves.push("original contributor sequence in conflict diagnostics");
  ordering.surface.semantics = ordering.surface.semantics.filter((semantic) => semantic !== "ordering");
  delete ordering.surface.orderingPolicy;
  assert.match(validateContract(ordering).findings.join("\n"), /behavioral claims require surface\.semantics.*ordering/u);

  const representation = sourceBoundVariadicContract();
  representation.schema = "behavioral-regression/v10";
  representation.problem.expected = "return container shape matches the populated array representation";
  representation.surface.semantics = representation.surface.semantics.filter((semantic) => semantic !== "representation");
  assert.match(validateContract(representation).findings.join("\n"), /behavioral claims require surface\.semantics.*representation/u);

  const returnedContainer = oracleBoundOrderingContract();
  returnedContainer.schema = "behavioral-regression/v10";
  returnedContainer.problem.expected = "the merge produces a single list in dependency order";
  returnedContainer.surface.semantics = returnedContainer.surface.semantics.filter((semantic) => semantic !== "representation");
  assert.match(validateContract(returnedContainer).findings.join("\n"), /behavioral claims require surface\.semantics.*representation/u);

  const oracleOnlyOrdering = oracleBoundOrderingContract();
  oracleOnlyOrdering.schema = "behavioral-regression/v10";
  oracleOnlyOrdering.problem.expected = "combine all contributors into one result";
  oracleOnlyOrdering.problem.actual = "the composed result is incorrect";
  oracleOnlyOrdering.problem.successCriteria = ["all contributors are represented once"];
  oracleOnlyOrdering.surface.preserves = ["existing supported inputs"];
  oracleOnlyOrdering.surface.semantics = ["composition"];
  delete oracleOnlyOrdering.surface.orderingPolicy;
  oracleOnlyOrdering.cases[0].oracle.assertions = ["contributors merge in deterministic first-seen order"];
  assert.match(
    validateContract(oracleOnlyOrdering).findings.join("\n"),
    /behavioral claims require surface\.semantics.*ordering/u,
  );
});

test("v10 requires an independent-chain oracle that distinguishes atomic layers from eager release", () => {
  const value = oracleBoundOrderingContract();
  value.schema = "behavioral-regression/v10";
  const independent = value.cases
    .flatMap((item) => item.oracle.scenarios ?? [])
    .find((scenario) => scenario.kind === "independent-chains");
  independent.contributors = [[1, 2], [3, 4]];
  independent.expected.order = [1, 3, 2, 4];

  assert.match(
    validateContract(value).findings.join("\n"),
    /independent-chains.*three pairwise-disjoint contributors.*three items/u,
  );
});

test("v10 ordering discriminators cannot collapse layers through duplicate-only chains", () => {
  const value = oracleBoundOrderingContract();
  value.schema = "behavioral-regression/v10";
  const orderingCase = value.cases.find((item) => (item.oracle.scenarios?.length ?? 0) > 0);
  orderingCase.oracle.scenarios.unshift({
    kind: "independent-pair",
    contributors: [[1, 1], [2, 2]],
    expected: { order: [1, 2], diagnostics: [] },
    marker: "BR_SCENARIO_DUPLICATE_PAIR",
    invocationLocator: "mapChannels(...duplicatePair)",
    witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_DUPLICATE_PAIR\", duplicatePair, pairActual)",
  });
  orderingCase.after.includes.push("BR_SCENARIO_DUPLICATE_PAIR");
  const chains = orderingCase.oracle.scenarios.find((scenario) => scenario.kind === "independent-chains");
  chains.contributors = [[1, 1, 1], [2, 2], [3, 3]];
  chains.expected.order = [1, 2, 3];

  assert.match(
    validateContract(value).findings.join("\n"),
    /independent-(?:pair|chains).*duplicate-free|distinct.*within each contributor/u,
  );
});

test("v10 ordering requires an exact independent-pair oracle", () => {
  const value = oracleBoundOrderingContract();
  value.schema = "behavioral-regression/v10";

  assert.match(
    validateContract(value).findings.join("\n"),
    /ordering scenarios must include independent-pair/u,
  );
});

test("v10 relation witnesses bind the frozen component invocation to the observed result", () => {
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  for (const item of value.cases) for (const relation of item.oracle.relations ?? []) {
    relation.resultBinding = "partialResult";
    relation.componentArguments = { "channel-0": "left", "channel-1": "right" };
    relation.invocationLocator = "partialResult = mapChannels(left, right)";
    relation.targetObservation = relation.sourceComponent === "channel-0" ? "partialResult[0]" : "partialResult[1]";
    relation.witnessLocator = `emitRelationWitness("${relation.marker}", ${relation.componentArguments[relation.sourceComponent]}, ${relation.targetObservation})`;
  }
  assert.doesNotMatch(validateContract(value).findings.join("\n"), /relation invocation|resultBinding/u);

  const detached = structuredClone(value);
  const relation = detached.cases.flatMap((item) => item.oracle.relations ?? [])[0];
  relation.targetObservation = `populatedResult.${relation.sourceComponent}`;
  relation.witnessLocator = `emitRelationWitness("${relation.marker}", ${relation.sourceComponent}, ${relation.targetObservation})`;
  assert.match(
    validateContract(detached).findings.join("\n"),
    /targetObservation.*direct property or index selector.*resultBinding/u,
  );
});

test("v10 empty-container boundaries require structurally empty canonical degenerate inputs", () => {
  const bindRelations = (value) => {
    value.schema = "behavioral-regression/v10";
    for (const item of value.cases) for (const relation of item.oracle.relations ?? []) {
      relation.resultBinding = "partialResult";
      relation.componentArguments = { "channel-0": "left", "channel-1": "right" };
      relation.invocationLocator = "partialResult = mapChannels(left, right)";
      relation.targetObservation = relation.sourceComponent === "channel-0" ? "partialResult[0]" : "partialResult[1]";
      relation.witnessLocator = `emitRelationWitness("${relation.marker}", ${relation.componentArguments[relation.sourceComponent]}, ${relation.targetObservation})`;
    }
    return value;
  };

  const mislabeled = bindRelations(sourceBoundVariadicContract());
  const allDegenerate = mislabeled.cases.find((item) => item.coverage.includes("all-degenerate"));
  allDegenerate.componentSamples["channel-0"] = { value: [0], representation: "array:length=1" };
  allDegenerate.componentSamples["channel-1"] = { value: [1], representation: "array:length=1" };
  for (const item of mislabeled.cases.filter((candidate) => candidate.coverage.includes("each-one-degenerate"))) {
    const component = item.degenerateComponents[0];
    item.componentSamples[component] = structuredClone(allDegenerate.componentSamples[component]);
  }
  assert.match(
    validateContract(mislabeled).findings.join("\n"),
    /canonical degenerate sample.*structurally empty.*empty-container input boundary/u,
  );

  const structurallyEmpty = bindRelations(sourceBoundVariadicContract());
  assert.doesNotMatch(
    validateContract(structurallyEmpty).findings.join("\n"),
    /canonical degenerate sample.*structurally empty/u,
  );

  const hollowPeer = bindRelations(sourceBoundVariadicContract());
  const partial = hollowPeer.cases.find((item) => item.coverage.includes("each-one-degenerate"));
  const peer = partial.preservedComponents[0];
  partial.componentSamples[peer] = { value: [[], []], representation: "array:shape=[2,0]" };
  partial.oracle.relations[0].sourceSample = structuredClone(partial.componentSamples[peer]);
  partial.oracle.relations[0].targetSample = structuredClone(partial.componentSamples[peer]);
  assert.match(
    validateContract(hollowPeer).findings.join("\n"),
    /preserved peer.*must contain a structurally populated value.*empty-container input boundary/u,
  );

  const sentinelBoundary = structuredClone(mislabeled);
  sentinelBoundary.problem.expected = "sentinel channel values preserve the populated peer";
  sentinelBoundary.problem.actual = "a sentinel channel value discards both results";
  sentinelBoundary.problem.successCriteria = [
    "each sentinel boundary preserves the populated peer",
    "a sentinel input returns an empty list",
    "non-empty array input remains supported",
  ];
  for (const item of sentinelBoundary.cases) {
    item.oracle.assertions = item.oracle.assertions.map((assertion) => assertion.replaceAll("empty", "sentinel"));
  }
  assert.doesNotMatch(
    validateContract(sentinelBoundary).findings.join("\n"),
    /canonical degenerate sample.*structurally empty/u,
  );
});

test("v10 variadic representation requires an asymmetric argument-slot matrix", () => {
  const value = oracleBoundOrderingContract();
  value.schema = "behavioral-regression/v10";
  value.surface.inputShape = "variadic";
  value.surface.components = [];
  value.surface.compositionDepth = "three-or-more";
  value.surface.repairMode = "extend-existing-seam";
  value.surface.semantics = ["ordering", "representation"];
  for (const form of value.surface.callForms) {
    form.dataComponents = ["contributors"];
    form.variadic = true;
    form.signatureLocator = "function mapChannels(...contributors)";
  }
  const cases = value.cases;
  cases[0].coverage.push("arity-zero", "arity-one", "arity-two", "arity-many", "alternate-representation");
  const orderingCase = cases.find((item) => item.oracle.scenarios?.length > 0);
  orderingCase.oracle.scenarios.unshift({
    kind: "independent-pair",
    contributors: [[1, 2], [3, 4]],
    expected: { order: [1, 3, 2, 4], diagnostics: [] },
    marker: "BR_SCENARIO_INDEPENDENT_PAIR",
    invocationLocator: "mapChannels(...pairContributors)",
    witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_INDEPENDENT_PAIR\", pairContributors, pairActual)",
  });
  orderingCase.after.includes.push("BR_SCENARIO_INDEPENDENT_PAIR");
  const independent = orderingCase.oracle.scenarios.find((scenario) => scenario.kind === "independent-chains");
  independent.contributors = [[1, 2, 7], [3, 4], [5, 6]];
  independent.expected.order = [1, 3, 5, 2, 4, 6, 7];
  for (const item of cases) {
    item.componentSamples = {};
    item.degenerateComponents = [];
    item.preservedComponents = [];
    item.oracle.relations = [];
  }

  assert.match(
    validateContract(value).findings.join("\n"),
    /components.*between 2 and 8|all-degenerate|each-one-degenerate/u,
  );

  value.surface.components = ["contributors"];
  assert.match(
    validateContract(value).findings.join("\n"),
    /components.*between 2 and 8|all-degenerate|each-one-degenerate/u,
  );
});

test("v10 homogeneous variadic aggregates may prove empty-contributor neutrality without inventing slots", () => {
  const value = homogeneousNeutralityContract();
  assert.deepEqual(validateContract(value).findings, []);

  const missing = structuredClone(value);
  delete missing.cases.find((item) => item.oracle.neutrality).oracle.neutrality;
  assert.match(
    validateContract(missing).findings.join("\n"),
    /homogeneous-neutrality.*requires.*neutrality proof/u,
  );

  const detached = structuredClone(value);
  const neutrality = detached.cases.find((item) => item.oracle.neutrality).oracle.neutrality;
  neutrality.leftInvocationLocator = "leftResult = mapChannels(populated, empty)";
  assert.match(
    validateContract(detached).findings.join("\n"),
    /leftInvocationLocator.*degenerate.*populated/u,
  );

  const laundered = structuredClone(value);
  const launderedNeutrality = laundered.cases.find((item) => item.oracle.neutrality).oracle.neutrality;
  launderedNeutrality.witnessLocator = "emitNeutralityWitness(\"BR_NEUTRALITY_CONTRIBUTORS\", populated, empty, expected, expected, expected)";
  assert.match(
    validateContract(laundered).findings.join("\n"),
    /witnessLocator.*three bound results/u,
  );

  for (const invalidIdentity of [[0], [false], [[]]]) {
    const nonemptyIdentity = homogeneousNeutralityContract();
    nonemptyIdentity.cases.find((item) => item.oracle.neutrality).oracle.neutrality.degenerateSample.value = invalidIdentity;
    assert.match(
      validateContract(nonemptyIdentity).findings.join("\n"),
      /degenerateSample\.value.*empty contributor value/u,
      JSON.stringify(invalidIdentity),
    );
  }

  const collapsedExpected = homogeneousNeutralityContract();
  collapsedExpected.cases.find((item) => item.oracle.neutrality).oracle.neutrality.expectedSample.value = [];
  assert.match(
    validateContract(collapsedExpected).findings.join("\n"),
    /expectedSample\.value.*scalar leaf/u,
  );
});

test("v10 coupled-boundary proves jointly degenerate components without inventing invalid partial peers", () => {
  const value = coupledBoundaryContract();
  assert.deepEqual(validateContract(value).findings, []);

  const missingComponent = coupledBoundaryContract();
  const missingProof = missingComponent.cases.find((item) => item.oracle.coupledBoundary).oracle.coupledBoundary;
  delete missingProof.componentArguments["channel-1"];
  assert.match(validateContract(missingComponent).findings.join("\n"), /coupledBoundary.*componentArguments.*channel-1/u);

  const repeatedArgument = coupledBoundaryContract();
  const repeatedProof = repeatedArgument.cases.find((item) => item.oracle.coupledBoundary).oracle.coupledBoundary;
  repeatedProof.componentArguments["channel-1"] = "emptyLeft";
  repeatedProof.invocationLocator = "emptyResult = mapChannels(emptyLeft, emptyLeft)";
  repeatedProof.witnessLocator = "emitCoupledBoundaryWitness(\"BR_COUPLED_BOUNDARY\", emptyLeft, emptyLeft, emptyResult)";
  assert.match(validateContract(repeatedArgument).findings.join("\n"), /coupledBoundary.*componentArguments.*distinct identifiers/u);

  const laundered = coupledBoundaryContract();
  const launderedProof = laundered.cases.find((item) => item.oracle.coupledBoundary).oracle.coupledBoundary;
  launderedProof.witnessLocator = "emitCoupledBoundaryWitness(\"BR_COUPLED_BOUNDARY\", emptyLeft, emptyRight, expectedSample)";
  assert.match(validateContract(laundered).findings.join("\n"), /coupledBoundary.*witnessLocator.*resultBinding/u);

  const missingBoundary = coupledBoundaryContract();
  for (const item of missingBoundary.cases) item.coverage = item.coverage.filter((token) => token !== "boundary");
  assert.match(validateContract(missingBoundary).findings.join("\n"), /coupled-boundary.*boundary coverage/u);

  const matrixStillRequiresPartials = coupledBoundaryContract();
  matrixStillRequiresPartials.surface.interactionModel = "component-matrix";
  assert.match(validateContract(matrixStillRequiresPartials).findings.join("\n"), /each-one-degenerate/u);
});

test("v10 homogeneous-neutrality proof binds three adjacent real seam results", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-homogeneous-neutrality-"));
  const value = homogeneousNeutralityContract();
  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels.filter((item) => item.length); }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels([2]);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const neutrality = value.cases.find((item) => item.oracle.neutrality).oracle.neutrality;
  const proofPath = join(root, value.scope.verificationPaths[0]);
  const proofLines = [
    value.surface.publicLocator,
    value.surface.constraintLocator,
    neutrality.singleInvocationLocator,
    neutrality.leftInvocationLocator,
    neutrality.rightInvocationLocator,
    neutrality.witnessLocator,
  ];
  writeFileSync(proofPath, `${proofLines.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  writeFileSync(proofPath, `${proofLines.slice(0, -1).join("\n")}\nrightResult = expected\n${neutrality.witnessLocator}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /neutrality.*(?:rightResult.*reassigned|result binding.*mutated|adjacent proof block)/u,
  );
});

test("v11 coupled-boundary proof binds one real multi-component invocation to its witness", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-coupled-boundary-"));
  const value = coupledBoundaryContract();
  value.schema = "behavioral-regression/v11";
  value.scope.supersededAssertions = [];
  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels([2]);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const coupled = value.cases.find((item) => item.oracle.coupledBoundary).oracle.coupledBoundary;
  const proofPath = join(root, value.scope.verificationPaths[0]);
  const proofLines = [
    "function emitCoupledBoundaryWitness(marker, left, right, result) { console.log(marker, JSON.stringify({ left, right, result })); }",
    value.surface.publicLocator,
    value.surface.constraintLocator,
    coupled.invocationLocator,
    coupled.witnessLocator,
  ];
  writeFileSync(proofPath, `${proofLines.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  writeFileSync(proofPath, `${proofLines.slice(0, -1).join("\n")}\nemptyResult = expectedSample\n${coupled.witnessLocator}\n`);
  assert.match(loadContract(path).findings.join("\n"), /coupled-boundary resultBinding is reassigned or mutated/u);

  writeFileSync(proofPath, `${proofLines.slice(0, -1).join("\n")}\n${coupled.invocationLocator}\n${coupled.witnessLocator}\n`);
  assert.match(loadContract(path).findings.join("\n"), /coupled-boundary invocationLocator must occur exactly once/u);
});

test("v10 proof rejects a result rebound between its relation invocation and witness", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-causal-relation-"));
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "mapChannels(left, right);\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });

  const proofLines = [value.surface.publicLocator, value.surface.constraintLocator];
  let relationNumber = 0;
  for (const item of value.cases) for (const relation of item.oracle.relations ?? []) {
    relationNumber += 1;
    const binding = `partialResult${relationNumber}`;
    relation.resultBinding = binding;
    relation.componentArguments = { "channel-0": "left", "channel-1": "right" };
    relation.invocationLocator = `${binding} = mapChannels(left, right)`;
    relation.targetObservation = `${binding}[1]`;
    relation.witnessLocator = `emitRelationWitness("${relation.marker}", ${relation.componentArguments[relation.sourceComponent]}, ${relation.targetObservation})`;
    proofLines.push(relation.invocationLocator, relation.witnessLocator);
  }
  writeFileSync(join(root, value.scope.verificationPaths[0]), `${proofLines.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  const transformedPeer = structuredClone(value);
  const transformedCase = transformedPeer.cases.find((item) => (item.oracle.relations ?? []).length > 0);
  const transformedRelation = transformedCase.oracle.relations[0];
  transformedCase.componentSamples[transformedRelation.sourceComponent] = { value: [2], representation: "array:length=1" };
  transformedRelation.sourceSample = { value: [2], representation: "array:length=1" };
  transformedRelation.targetSample = { value: [6], representation: "array:length=1" };
  assert.notDeepEqual(transformedRelation.sourceSample, transformedRelation.targetSample);
  assert.doesNotMatch(validateContract(transformedPeer).findings.join("\n"), /complete output component|nested metadata/u);

  const first = value.cases.flatMap((item) => item.oracle.relations ?? [])[0];
  const escaped = proofLines.flatMap((line) => line === first.witnessLocator
    ? [`${first.resultBinding} = mapChannels(populatedLeft, populatedRight)`, line]
    : [line]);
  writeFileSync(join(root, value.scope.verificationPaths[0]), `${escaped.join("\n")}\n`);
  assert.match(loadContract(path).findings.join("\n"), /resultBinding is reassigned or mutated between invocation and witness/u);

  const fallback = structuredClone(value);
  const fallbackRelation = fallback.cases.flatMap((item) => item.oracle.relations ?? [])[0];
  fallbackRelation.targetObservation = `${fallbackRelation.resultBinding} || populatedResult[1]`;
  fallbackRelation.witnessLocator = `emitRelationWitness("${fallbackRelation.marker}", right, ${fallbackRelation.targetObservation})`;
  assert.match(
    validateContract(fallback).findings.join("\n"),
    /targetObservation.*direct property or index selector/u,
  );

  const metadataOnly = structuredClone(value);
  const metadataRelation = metadataOnly.cases.flatMap((item) => item.oracle.relations ?? [])[0];
  metadataRelation.targetObservation = `${metadataRelation.resultBinding}[1].ndim`;
  metadataRelation.targetSample = { value: 1, representation: "scalar" };
  metadataRelation.witnessLocator = `emitRelationWitness("${metadataRelation.marker}", ${metadataRelation.componentArguments[metadataRelation.sourceComponent]}, ${metadataRelation.targetObservation})`;
  assert.match(
    validateContract(metadataOnly).findings.join("\n"),
    /preserved peer.*complete output component|targetObservation.*one direct property or index selector/u,
  );

  const aliasedArguments = structuredClone(value);
  const aliasedRelation = aliasedArguments.cases.flatMap((item) => item.oracle.relations ?? [])[0];
  aliasedRelation.componentArguments = { "channel-0": "left", "channel-1": "left" };
  assert.match(
    validateContract(aliasedArguments).findings.join("\n"),
    /componentArguments.*distinct identifiers/u,
  );

  const detachedSource = structuredClone(value);
  const detachedRelation = detachedSource.cases.flatMap((item) => item.oracle.relations ?? [])[0];
  detachedRelation.witnessLocator = `emitRelationWitness("${detachedRelation.marker}", populatedRight, ${detachedRelation.targetObservation})`;
  assert.match(
    validateContract(detachedSource).findings.join("\n"),
    /witnessLocator.*original invocation argument/u,
  );

  writeFileSync(join(root, value.scope.verificationPaths[0]), `${proofLines.flatMap((line) => line === first.witnessLocator
    ? ["populatedResult = mapChannels(populatedLeft, populatedRight)", line]
    : [line]).join("\n")}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /second public or constraint seam invocation between relation invocation and witness/u,
  );
});

test("v9 independently checks stable topological layer expectations", () => {
  const value = oracleBoundOrderingContract();
  assert.deepEqual(validateContract(value).findings, []);

  const depthFirst = structuredClone(value);
  depthFirst.cases.flatMap((item) => item.oracle.scenarios ?? []).find((scenario) => scenario.kind === "independent-chains").expected.order = [1, 2, 3, 4, 5, 6];
  assert.match(
    validateContract(depthFirst).findings.join("\n"),
    /expected\.order.*stable-topological-layers.*\[1,3,5,2,4,6\]/u,
  );

  const contextFreeCycle = structuredClone(value);
  contextFreeCycle.cases.flatMap((item) => item.oracle.scenarios ?? []).find((scenario) => scenario.kind === "genuine-cycle").expected.diagnostics = ["cycle detected"];
  assert.match(validateContract(contextFreeCycle).findings.join("\n"), /diagnostic.*original contributor/u);

  const inventedApi = structuredClone(value);
  inventedApi.cases.flatMap((item) => item.oracle.scenarios ?? [])[0].invocationLocator = "OrderingPlan.solve(...independentContributors)";
  assert.match(validateContract(inventedApi).findings.join("\n"), /invocationLocator.*constraintLocator|real constraint seam/u);
});

test("v9 ordering accepts two independent chains and duplicates across contributors", () => {
  const value = oracleBoundOrderingContract();
  const scenarios = value.cases.flatMap((item) => item.oracle.scenarios ?? []);
  const independent = scenarios.find((scenario) => scenario.kind === "independent-chains");
  independent.contributors = [[1, 2], [3, 4]];
  independent.expected.order = [1, 3, 2, 4];
  const duplicates = scenarios.find((scenario) => scenario.kind === "duplicates");
  duplicates.contributors = [[1, 2], [1, 2]];
  duplicates.expected.order = [1, 2];
  value.cases[2].coverage.push("ordering");
  assert.deepEqual(validateContract(value).findings, []);
});

test("v9 omits component relation arrays for non-interaction surfaces", () => {
  const value = oracleBoundOrderingContract();
  value.surface.inputShape = "variadic";
  value.surface.components = [];
  value.surface.compositionDepth = "three-or-more";
  value.surface.repairMode = "extend-existing-seam";
  value.surface.semantics = ["composition", "ordering"];
  for (const form of value.surface.callForms) {
    form.dataComponents = ["sequences"];
    form.variadic = true;
    form.signatureLocator = "function mapChannels(...sequences)";
  }
  value.cases[0].coverage.push("arity-zero", "arity-one", "arity-two", "arity-many", "composed-operation");
  for (const item of value.cases) {
    item.coverage = item.coverage.filter((token) => !["all-populated", "all-degenerate", "each-one-degenerate", "alternate-representation"].includes(token));
    item.oracle.relations = [];
    delete item.componentSamples;
    delete item.degenerateComponents;
    delete item.preservedComponents;
    delete item.receipts;
    if (item.role !== "invariant") delete item.protectedPaths;
  }
  assert.deepEqual(validateContract(value).findings, []);
});

test("v9 requires an immutable project regression seam in addition to isolated probes", () => {
  const value = oracleBoundOrderingContract();
  assert.deepEqual(validateContract(value).findings, []);

  const missing = structuredClone(value);
  missing.scope.regressionPaths = [];
  for (const item of missing.cases) item.protectedPaths = [];
  assert.match(validateContract(missing).findings.join("\n"), /regressionPaths.*tracked project test/u);

  const detached = structuredClone(value);
  for (const item of detached.cases) item.protectedPaths = [];
  assert.match(validateContract(detached).findings.join("\n"), /compatibility invariant.*protectedPaths/u);

  const misbound = structuredClone(value);
  misbound.cases.find((item) => item.role === "invariant").protectedPaths = ["test/not-declared.cjs"];
  assert.match(validateContract(misbound).findings.join("\n"), /protectedPaths.*scope\.regressionPaths/u);

  const statusOnly = structuredClone(value);
  statusOnly.cases.find((item) => item.role === "invariant").oracle.assertions = ["existing media test suite remains green"];
  assert.match(validateContract(statusOnly).findings.join("\n"), /invariant.*observable behavior.*test status/u);
});

test("v9 rejects fragmented proof ceremony instead of the four-case bundle", () => {
  const value = oracleBoundOrderingContract();
  assert.deepEqual(validateContract(value).findings, []);

  const extra = structuredClone(value.cases[2]);
  extra.id = "BR-C5";
  value.cases.push(extra);
  assert.match(validateContract(value).findings.join("\n"), /exactly four cases/u);

  const fragmented = oracleBoundOrderingContract();
  fragmented.cases[1].proofPath = `.behavioral-regression/${fragmented.id}/boundary.mjs`;
  fragmented.cases[1].command = `node ${fragmented.cases[1].proofPath}`;
  fragmented.scope.verificationPaths.push(fragmented.cases[1].proofPath);
  assert.match(validateContract(fragmented).findings.join("\n"), /one shared isolated proof bundle/u);
});

test("v9 project regression paths may add a RED but may not rewrite baseline assertions", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-protected-regression-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "behavioral@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Behavioral Fixture"], { cwd: root });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "let calls = 1;\n--calls;\nmapChannels([], []);\n");
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture baseline"], { cwd: root });

  const value = sourceBoundVariadicContract();
  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  const proof = [
    "mapChannels(",
    ...value.cases.flatMap((item) => item.oracle.relations ?? []).map((relation) => relation.witnessLocator),
  ];
  writeFileSync(join(root, value.cases[0].proofPath), `${proof.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  writeFileSync(join(root, "test", "channel-map.test.cjs"), "let calls = 1;\n--calls;\nmapChannels([1], [2]);\n");
  assert.match(loadContract(path).findings.join("\n"), /regressionPath.*remove.*baseline assertion/u);

  writeFileSync(join(root, ".gitattributes"), "test/channel-map.test.cjs -diff\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "let calls = 1;\nmapChannels([], []);\n");
  assert.match(loadContract(path).findings.join("\n"), /regressionPath.*remove.*baseline assertion/u);
});

test("v11 permits only an oracle-bound expected-literal supersession", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-superseded-regression-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "behavioral@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Behavioral Fixture"], { cwd: root });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  const before = "assert.deepEqual(mapChannels([1, 2], [3, 4]), [1, 2, 3, 4]);";
  const after = "assert.deepEqual(mapChannels([1, 2], [3, 4]), [1, 3, 2, 4]);";
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${before}\nlet calls = 1;\n--calls;\nassert.equal(mapChannels([], []).length, 2);\n`);
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture baseline"], { cwd: root });

  const value = homogeneousNeutralityContract();
  value.schema = "behavioral-regression/v11";
  value.surface.semantics.push("ordering");
  value.surface.orderingPolicy = "stable-topological-layers";
  const orderingCase = value.cases[2];
  const scenarios = [
    ["independent-pair", [[1, 2], [3, 4]], [1, 3, 2, 4], "BR_SCENARIO_INDEPENDENT_PAIR", "pair"],
    ["independent-chains", [[1, 2, 7], [3, 4], [5, 6]], [1, 3, 5, 2, 4, 6, 7], "BR_SCENARIO_INDEPENDENT_CHAINS", "chains"],
    ["shared-prefix", [[1, 2], [1, 3]], [1, 2, 3], "BR_SCENARIO_SHARED_PREFIX", "prefix"],
    ["shared-suffix", [[1, 3], [2, 3]], [1, 2, 3], "BR_SCENARIO_SHARED_SUFFIX", "suffix"],
    ["duplicates", [[1, 2, 2], [1, 2]], [1, 2], "BR_SCENARIO_DUPLICATES", "duplicates"],
    ["genuine-cycle", [[1, 2], [2, 1]], [1, 2], "BR_SCENARIO_CYCLE", "cycle"],
  ].map(([kind, contributors, order, marker, variable]) => ({
    kind,
    contributors,
    expected: { order, diagnostics: kind === "genuine-cycle" ? ["conflict: [1,2] [2,1]"] : [] },
    marker,
    contributorsBinding: `${variable}Contributors`,
    observationBinding: `${variable}Observation`,
    ...(kind === "genuine-cycle" ? {
      diagnosticProjection: { sourceKind: "seam-result-field", sourceBinding: "rawObservation", valueSelector: "self" },
    } : {}),
    invocationLocator: `${variable}Observation = observeScenario(() => mapChannels(...${variable}Contributors))`,
    witnessLocator: `emitScenarioWitness("${marker}", ${variable}Contributors, ${variable}Observation.order, ${variable}Observation.diagnostics)`,
  }));
  orderingCase.oracle.scenarios = scenarios;
  orderingCase.coverage.push("independent-order", "shared-order", "conflict-order");
  orderingCase.after.includes.push(...scenarios.map((scenario) => scenario.marker));
  value.scope.supersededAssertions = [{
    path: "test/channel-map.test.cjs",
    beforeAssertion: before,
    afterAssertion: after,
    beforeExpectedLiteral: "[1, 2, 3, 4]",
    afterExpectedLiteral: "[1, 3, 2, 4]",
    inputLiterals: ["[1, 2]", "[3, 4]"],
    assertionForm: "call",
    expectedOperandIndex: 1,
    valueCodec: "json",
    reason: "stable-topological-layers supersedes the eager binary expectation",
    targetCaseId: "BR-C3",
    scenarioMarker: "BR_SCENARIO_INDEPENDENT_PAIR",
  }];
  const missingProjection = structuredClone(value);
  delete missingProjection.cases
    .flatMap((item) => item.oracle.scenarios ?? [])
    .find((scenario) => scenario.kind === "genuine-cycle").diagnosticProjection;
  assert.match(
    validateContract(missingProjection).findings.join("\n"),
    /genuine-cycle.*diagnosticProjection|diagnosticProjection.*genuine-cycle/iu,
    "a v11 cycle must declare how diagnostics stay bound to the observed seam result",
  );
  mkdirSync(join(root, ".behavioral-regression", value.id), { recursive: true });
  const proof = [
    "mapChannels(",
    [
      "function observeScenario(callback) {",
      "  const rawObservation = callback();",
      "  return { order: rawObservation.order, diagnostics: rawObservation.diagnostics.map((item) => String(item)) };",
      "}",
    ].join("\n"),
    ...value.cases.flatMap((item) => item.oracle.relations ?? []).flatMap((relation) => [relation.invocationLocator, relation.witnessLocator]),
    ...value.cases.flatMap((item) => item.oracle.scenarios ?? []).flatMap((scenario) => [scenario.invocationLocator, scenario.witnessLocator]),
  ];
  const neutrality = value.cases.find((item) => item.oracle.neutrality).oracle.neutrality;
  proof.push(
    neutrality.singleInvocationLocator,
    neutrality.leftInvocationLocator,
    neutrality.rightInvocationLocator,
    neutrality.witnessLocator,
  );
  const witnessCallables = [...new Set([
    ...value.cases.flatMap((item) => item.oracle.relations ?? []).map((relation) => relation.witnessLocator),
    ...value.cases.flatMap((item) => item.oracle.scenarios ?? []).map((scenario) => scenario.witnessLocator),
    neutrality.witnessLocator,
  ].map((locator) => locator.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/u)?.[1]).filter(Boolean))];
  proof.unshift(...witnessCallables.map((name) => `function ${name}(...args) { return args; }`));
  writeFileSync(join(root, value.cases[0].proofPath), `${proof.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

  assert.deepEqual(loadContract(path).findings, [], "a declared supersession is metadata; the project test remains at its Git baseline");

  const hardcodedCycle = structuredClone(value);
  const hardcodedCycleScenario = hardcodedCycle.cases
    .flatMap((item) => item.oracle.scenarios ?? [])
    .find((scenario) => scenario.kind === "genuine-cycle");
  const originalCycleLocator = hardcodedCycleScenario.witnessLocator;
  hardcodedCycleScenario.witnessLocator = 'emitScenarioWitness("BR_SCENARIO_CYCLE", cycleContributors, cycleObservation.order, "conflict: [1,2] [2,1]")';
  const hardcodedCycleProof = proof.map((line) => line === originalCycleLocator ? hardcodedCycleScenario.witnessLocator : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${hardcodedCycleProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(hardcodedCycle, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /witnessLocator.*direct order\/diagnostics fields.*observationBinding|hardcoded.*diagnostic/iu,
    "a cycle witness must not replace captured diagnostics with a contract-shaped literal",
  );

  const contributorLaundering = structuredClone(value);
  const contributorCycle = contributorLaundering.cases
    .flatMap((item) => item.oracle.scenarios ?? [])
    .find((scenario) => scenario.kind === "genuine-cycle");
  contributorCycle.invocationLocator = "cycleObservation = observeScenario(cycleContributors, () => mapChannels(...cycleContributors))";
  const contributorLaunderingProof = proof.map((line) => {
    if (line === originalCycleLocator) return contributorCycle.witnessLocator;
    if (line === scenarios.find((scenario) => scenario.kind === "genuine-cycle").invocationLocator) return contributorCycle.invocationLocator;
    if (line.startsWith("function observeScenario(")) {
      return "function observeScenario(contributors, callback) { return { order: callback(), diagnostics: [\"conflict: \" + JSON.stringify(contributors[0]) + \" \" + JSON.stringify(contributors[1])] }; }";
    }
    return line;
  });
  writeFileSync(join(root, value.cases[0].proofPath), `${contributorLaunderingProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(contributorLaundering, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /single opaque zero-argument seam thunk|must not receive contributors/iu,
    "an observation helper must not receive contributors that it can use to synthesize contract-shaped diagnostics",
  );

  const rewrittenSeamResultProof = proof.map((line) => line.startsWith("function observeScenario(")
    ? "function observeScenario(callback) { const rawObservation = callback(); return { order: rawObservation.order, diagnostics: rawObservation.diagnostics.map((item) => \"cycle: \" + String(item)) }; }"
    : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${rewrittenSeamResultProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /diagnostics must be an unconditional identity projection of the same seam result diagnostics field/iu,
    "a canonical seam diagnostics field must not be prefixed or reformatted",
  );

  const pythonProjection = structuredClone(value);
  const pythonCycle = pythonProjection.cases
    .flatMap((item) => item.oracle.scenarios ?? [])
    .find((scenario) => scenario.kind === "genuine-cycle");
  const originalCycleInvocation = scenarios.find((scenario) => scenario.kind === "genuine-cycle").invocationLocator;
  pythonCycle.diagnosticProjection = { sourceKind: "python-warning-record", sourceBinding: "caught", valueSelector: "message" };
  pythonCycle.invocationLocator = "cycleObservation = observeScenario(lambda: mapChannels(*cycleContributors))";
  const pythonWitnessLocators = new Map();
  for (const scenario of pythonProjection.cases.flatMap((item) => item.oracle.scenarios ?? [])) {
    const originalWitness = scenario.witnessLocator;
    scenario.witnessLocator = originalWitness
      .replace(`${scenario.observationBinding}.order`, `${scenario.observationBinding}["order"]`)
      .replace(`${scenario.observationBinding}.diagnostics`, `${scenario.observationBinding}["diagnostics"]`);
    pythonWitnessLocators.set(originalWitness, scenario.witnessLocator);
  }
  const pythonHelper = [
    "def observeScenario(callback):",
    "    with warnings.catch_warnings(record=True) as caught:",
    "        result = callback()",
    "    return {\"order\": result, \"diagnostics\": [str(item.message) for item in caught]}",
  ].join("\n");
  const pythonProof = proof.map((line) => {
    if (line === originalCycleInvocation) return pythonCycle.invocationLocator;
    if (pythonWitnessLocators.has(line)) return pythonWitnessLocators.get(line);
    if (line.startsWith("function observeScenario(")) return pythonHelper;
    return line;
  });
  writeFileSync(join(root, value.cases[0].proofPath), `${pythonProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(pythonProjection, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, [], "a Python warning record may be projected without rewriting message text");

  const uncapturedPythonProof = pythonProof.map((line) => line === pythonHelper
    ? pythonHelper.replace("        result = callback()", "        pass\n    result = callback()")
    : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${uncapturedPythonProof.join("\n")}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /diagnostics must be an unconditional identity projection of captured warning\.message values/iu,
    "the warning recorder must surround the one real seam thunk call",
  );
  assert.match(
    loadContract(path).findings.join("\n"),
    /return \{["']order["']:\s*result,\s*["']diagnostics["']:\s*\[str\(item\.message\) for item in caught\]\}/iu,
    "projection recovery names the exact canonical Python return shape",
  );

  const rewrittenPythonProof = pythonProof.map((line) => line === pythonHelper
    ? pythonHelper.replace('[str(item.message) for item in caught]', '["cycle: " + str(cycleContributors[0]) + " " + str(cycleContributors[1]) for item in caught]')
    : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${rewrittenPythonProof.join("\n")}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /diagnostics must be an unconditional identity projection of captured warning\.message values/iu,
    "captured warnings must not be reformatted from contributor data",
  );
  writeFileSync(join(root, value.cases[0].proofPath), `${proof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

  const baselineTest = `${before}\nlet calls = 1;\n--calls;\nassert.equal(mapChannels([], []).length, 2);\n`;
  writeFileSync(join(root, "test", "shadow-channel-map.test.cjs"), baselineTest);
  unlinkSync(join(root, "test", "channel-map.test.cjs"));
  symlinkSync("shadow-channel-map.test.cjs", join(root, "test", "channel-map.test.cjs"));
  assert.match(
    loadContract(path).findings.join("\n"),
    /regressionPath.*regular file.*not.*symlink/iu,
  );
  unlinkSync(join(root, "test", "channel-map.test.cjs"));
  writeFileSync(join(root, "test", "channel-map.test.cjs"), baselineTest);

  const semanticNoop = structuredClone(value);
  semanticNoop.scope.supersededAssertions[0] = {
    ...semanticNoop.scope.supersededAssertions[0],
    beforeAssertion: "assert.deepEqual(mapChannels([1, 2], [3, 4]), [1,3,2,4]);",
    afterAssertion: "assert.deepEqual(mapChannels([1, 2], [3, 4]), [1, 3, 2, 4]);",
    beforeExpectedLiteral: "[1,3,2,4]",
  };
  assert.match(
    validateContract(semanticNoop).findings.join("\n"),
    /beforeExpectedLiteral.*semantically differ.*afterExpectedLiteral/iu,
  );

  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${after}\nlet calls = 1;\n--calls;\nassert.equal(mapChannels([], []).length, 2);\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /regressionPath.*must remain (?:byte-)?identical to the Git baseline|project test.*must not be rewritten/iu,
  );
  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${before}\nlet calls = 1;\n--calls;\nassert.equal(mapChannels([], []).length, 2);\n`);
  assert.deepEqual(loadContract(path).findings, []);

  const undefinedWitness = structuredClone(value);
  const typoWitness = neutrality.witnessLocator.replace(/^[A-Za-z_$][A-Za-z0-9_$]*/u, "emitNeutralityTypo");
  undefinedWitness.cases.find((item) => item.oracle.neutrality).oracle.neutrality.witnessLocator = typoWitness;
  const typoProof = proof.map((line) => line === neutrality.witnessLocator ? typoWitness : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${typoProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(undefinedWitness, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /witness callable emitNeutralityTypo.*defined in proofPath/iu);

  const renamedUndefinedWitness = structuredClone(value);
  const renamedWitness = neutrality.witnessLocator.replace(/^[A-Za-z_$][A-Za-z0-9_$]*/u, "recordNeutralityWitness");
  renamedUndefinedWitness.cases.find((item) => item.oracle.neutrality).oracle.neutrality.witnessLocator = renamedWitness;
  const renamedProof = proof.map((line) => line === neutrality.witnessLocator ? renamedWitness : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${renamedProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(renamedUndefinedWitness, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /witness callable recordNeutralityWitness.*defined in proofPath/iu);

  writeFileSync(join(root, value.cases[0].proofPath), `const recordNeutralityWitness = 0;\n${renamedProof.join("\n")}\n`);
  assert.match(loadContract(path).findings.join("\n"), /witness callable recordNeutralityWitness.*defined in proofPath/iu);

  const dottedUndefinedWitness = structuredClone(value);
  const dottedWitness = neutrality.witnessLocator.replace(/^[A-Za-z_$][A-Za-z0-9_$]*/u, "custom.recordNeutralityWitness");
  dottedUndefinedWitness.cases.find((item) => item.oracle.neutrality).oracle.neutrality.witnessLocator = dottedWitness;
  const dottedProof = proof.map((line) => line === neutrality.witnessLocator ? dottedWitness : line);
  writeFileSync(join(root, value.cases[0].proofPath), `${dottedProof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(dottedUndefinedWitness, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /witness callable custom\.recordNeutralityWitness.*defined in proofPath|dotted custom witness.*forbidden/iu);

  for (const escapedCallee of ['custom["recordNeutralityWitness"]', "custom?.recordNeutralityWitness"]) {
    const indirectUndefinedWitness = structuredClone(value);
    const indirectWitness = neutrality.witnessLocator.replace(/^[A-Za-z_$][A-Za-z0-9_$]*/u, escapedCallee);
    indirectUndefinedWitness.cases.find((item) => item.oracle.neutrality).oracle.neutrality.witnessLocator = indirectWitness;
    const indirectProof = proof.map((line) => line === neutrality.witnessLocator ? indirectWitness : line);
    writeFileSync(join(root, value.cases[0].proofPath), `${indirectProof.join("\n")}\n`);
    writeFileSync(path, `${JSON.stringify(indirectUndefinedWitness, null, 2)}\n`);
    assert.match(loadContract(path).findings.join("\n"), /witness callable.*must be defined in proofPath/iu);
  }
  writeFileSync(join(root, value.cases[0].proofPath), `${proof.join("\n")}\n`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

  const nonOrdering = homogeneousNeutralityContract();
  nonOrdering.schema = "behavioral-regression/v11";
  nonOrdering.scope.supersededAssertions = [];
  assert.doesNotMatch(
    validateContract(nonOrdering).findings.join("\n"),
    /supersededAssertions/iu,
    "a v11 task without ordering semantics must not manufacture an unrelated baseline expectation replacement",
  );

  const missingOrderingSupersession = structuredClone(value);
  missingOrderingSupersession.scope.supersededAssertions = [];
  assert.match(
    validateContract(missingOrderingSupersession).findings.join("\n"),
    /ordering semantics.*at least one.*supersededAssertions/iu,
  );

  const missingSupersession = structuredClone(value);
  delete missingSupersession.scope.supersededAssertions;
  const missingSupersessionFindings = validateContract(missingSupersession).findings.join("\n");
  assert.match(missingSupersessionFindings, /supersededAssertions must be an array with at most 20/iu);

  const nonDiscriminatingChains = structuredClone(value);
  const chainsScenario = nonDiscriminatingChains.cases[2].oracle.scenarios.find((scenario) => scenario.kind === "independent-chains");
  chainsScenario.contributors = [[1], [2], [3, 4, 5]];
  chainsScenario.expected.order = [1, 2, 3, 4, 5];
  assert.match(validateContract(nonDiscriminatingChains).findings.join("\n"), /independent-chains.*each.*at least two|each contributor.*two/iu);

  const parameterRow = structuredClone(value);
  parameterRow.scope.supersededAssertions[0] = {
    ...parameterRow.scope.supersededAssertions[0],
    beforeAssertion: "(([1, 2], [3, 4]), [1, 2, 3, 4]),",
    afterAssertion: "(([1, 2], [3, 4]), [1, 3, 2, 4]),",
    assertionForm: "sequence",
    expectedOperandIndex: 1,
    consumerLocator: "assert.deepEqual(mapChannels(...contributors), expected)",
  };
  assert.deepEqual(validateContract(parameterRow).findings, []);

  writeFileSync(join(root, "test", "channel-map.test.cjs"), `const inert = \`\n${before}\n\`;\n`);
  execFileSync("git", ["add", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "string-only assertion baseline"], { cwd: root });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /beforeAssertion.*executable Git-baseline assertion/iu,
  );

  const sequenceBefore = "(([1, 2], [3, 4]), [1, 2, 3, 4]),";
  const sequenceConsumer = "assert.deepEqual(mapChannels(...contributors), expected)";
  writeFileSync(join(root, "test", "channel-map.test.cjs"), `[\n${sequenceBefore}\n]\n// ${sequenceConsumer}\n`);
  execFileSync("git", ["add", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "comment-only consumer baseline"], { cwd: root });
  writeFileSync(path, `${JSON.stringify(parameterRow, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /consumerLocator.*executable Git-baseline consumer/iu,
  );

  const executableSequence = structuredClone(parameterRow);
  executableSequence.scope.supersededAssertions[0].consumerLocator = "assert.deepEqual(mapChannels(list1, list2), expected)";
  writeFileSync(join(root, "test", "channel-map.test.cjs"), `[\n${sequenceBefore}\n]\n${executableSequence.scope.supersededAssertions[0].consumerLocator}\n`);
  execFileSync("git", ["add", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "executable sequence consumer baseline"], { cwd: root });
  writeFileSync(path, `${JSON.stringify(executableSequence, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  const targetOnlyConsumer = structuredClone(executableSequence);
  targetOnlyConsumer.scope.supersededAssertions[0].consumerLocator = "assert.deepEqual(mapChannels(...contributors), expected)";
  writeFileSync(path, `${JSON.stringify(targetOnlyConsumer, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /consumerLocator.*executable Git-baseline consumer/iu,
  );

  const indentedSequence = structuredClone(parameterRow);
  indentedSequence.scope.supersededAssertions[0].consumerLocator = "self.assertEqual(mapChannels(list1, list2), expected)";
  writeFileSync(join(root, "test", "channel-map.test.cjs"), [
    "def test_merge(self):",
    "    test_values = (",
    `        ${sequenceBefore}`,
    "    )",
    "    for (list1, list2), expected in test_values:",
    `        ${indentedSequence.scope.supersededAssertions[0].consumerLocator}`,
    "",
  ].join("\n"));
  execFileSync("git", ["add", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "indented sequence baseline"], { cwd: root });
  writeFileSync(path, `${JSON.stringify(indentedSequence, null, 2)}\n`);
  assert.deepEqual(
    loadContract(path).findings,
    [],
    "sequence supersession metadata may omit source indentation while remaining uniquely bound to executable baseline code",
  );

  writeFileSync(join(root, "test", "channel-map.test.cjs"), baselineTest);
  execFileSync("git", ["add", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "restore executable assertion baseline"], { cwd: root });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

  const expectedOperandEscape = structuredClone(value);
  expectedOperandEscape.scope.supersededAssertions[0] = {
    ...expectedOperandEscape.scope.supersededAssertions[0],
    beforeAssertion: 'assert.deepEqual(mapChannels([1, 2, 3, 4]), expected, "contributors [1, 2] [3, 4]");',
    afterAssertion: 'assert.deepEqual(mapChannels([1, 3, 2, 4]), expected, "contributors [1, 2] [3, 4]");',
  };
  assert.match(
    validateContract(expectedOperandEscape).findings.join("\n"),
    /expected literal.*operand|expected operand/iu,
  );

  const trailingInputEscape = structuredClone(value);
  trailingInputEscape.scope.supersededAssertions[0] = {
    ...trailingInputEscape.scope.supersededAssertions[0],
    beforeAssertion: "assert.deepEqual(mapChannels([1, 2], [3, 4], [1, 2, 3, 4]), expected);",
    afterAssertion: "assert.deepEqual(mapChannels([1, 2], [3, 4], [1, 3, 2, 4]), expected);",
  };
  assert.match(validateContract(trailingInputEscape).findings.join("\n"), /expected literal.*operand|expected operand/iu);

  const directSeamEscape = structuredClone(value);
  directSeamEscape.scope.supersededAssertions[0] = {
    ...directSeamEscape.scope.supersededAssertions[0],
    beforeAssertion: "mapChannels([[1, 2], [3, 4]], [1, 2, 3, 4]);",
    afterAssertion: "mapChannels([[1, 2], [3, 4]], [1, 3, 2, 4]);",
  };
  assert.match(validateContract(directSeamEscape).findings.join("\n"), /outer assertion call|non-expected operand.*declared seam/iu);

  const fakeSeamEscape = structuredClone(value);
  fakeSeamEscape.scope.supersededAssertions[0] = {
    ...fakeSeamEscape.scope.supersededAssertions[0],
    beforeAssertion: "assert.deepEqual(fakeMerge([1, 2], [3, 4]), [1, 2, 3, 4]);",
    afterAssertion: "assert.deepEqual(fakeMerge([1, 2], [3, 4]), [1, 3, 2, 4]);",
  };
  assert.match(validateContract(fakeSeamEscape).findings.join("\n"), /non-expected operand.*declared seam/iu);

  const mismatchedInput = structuredClone(value);
  const pairScenario = mismatchedInput.cases[2].oracle.scenarios.find((scenario) => scenario.kind === "independent-pair");
  pairScenario.contributors = [[10, 20], [30, 40]];
  pairScenario.expected.order = [10, 30, 20, 40];
  mismatchedInput.scope.supersededAssertions[0].afterExpectedLiteral = "[10, 30, 20, 40]";
  mismatchedInput.scope.supersededAssertions[0].afterAssertion = before.replace("[1, 2, 3, 4]", "[10, 30, 20, 40]");
  assert.match(validateContract(mismatchedInput).findings.join("\n"), /inputLiterals must equal.*scenario contributors/u);

  const collapsedTargets = structuredClone(value);
  collapsedTargets.scope.supersededAssertions.push({
    ...collapsedTargets.scope.supersededAssertions[0],
    beforeAssertion: ` ${before}`,
    afterAssertion: ` ${after}`,
  });
  assert.match(validateContract(collapsedTargets).findings.join("\n"), /duplicates another superseded baseline assertion|duplicate supersession target/u);

  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${after}\nlet calls = 1;\nassert.equal(mapChannels([], []).length, 2);\n`);
  assert.match(loadContract(path).findings.join("\n"), /must remain (?:byte-)?identical to the Git baseline.*metadata.*does not authorize candidate test edits/iu);

  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${after}\nreturn;\nlet calls = 1;\n--calls;\nassert.equal(mapChannels([], []).length, 2);\n`);
  assert.match(loadContract(path).findings.join("\n"), /must remain (?:byte-)?identical to the Git baseline.*metadata.*does not authorize candidate test edits/iu);

  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${after}\n`);
  assert.match(loadContract(path).findings.join("\n"), /must remain (?:byte-)?identical to the Git baseline.*metadata.*does not authorize candidate test edits/iu);

  writeFileSync(join(root, "test", "channel-map.test.cjs"), "assert.ok(true);\nassert.equal(mapChannels([], []).length, 2);\n");
  value.scope.supersededAssertions[0].afterAssertion = "assert.ok(true);";
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.match(loadContract(path).findings.join("\n"), /afterAssertion must equal.*single expected literal replacement/u);

  value.scope.supersededAssertions[0].afterAssertion = after;
  const invalidBaseline = Buffer.concat([Buffer.from(baselineTest, "utf8"), Buffer.from([0x80])]);
  writeFileSync(join(root, "test", "channel-map.test.cjs"), invalidBaseline);
  execFileSync("git", ["add", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "non utf8 baseline"], { cwd: root });
  writeFileSync(join(root, "test", "channel-map.test.cjs"), Buffer.concat([Buffer.from(baselineTest, "utf8"), Buffer.from([0x81])]));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.match(
    loadContract(path).findings.join("\n"),
    /regressionPath.*(?:valid UTF-8|byte-identical to the Git baseline)/iu,
  );
});

test("v4 evidence binds public and constraint coverage to concrete proof files", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-evidence-"));
  mkdirSync(join(root, ".behavioral-regression"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "normalize.js"), "export function normalize(value) { return value; }\n");
  for (const path of ["primary", "boundary", "representation", "compat"]) {
    writeFileSync(join(root, "test", `${path}.mjs`), "normalize(value);\n");
  }
  const value = evidenceBoundContract();
  const path = join(root, ".behavioral-regression", `${value.id}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(loadContract(path).findings, []);

  writeFileSync(join(root, "test", "primary.mjs"), "callThroughAlias(value);\n");
  assert.match(loadContract(path).findings.join("\n"), /constraintLocator.*proofPath/u);
});

test("v4 three-or-more composition requires direct many-arity RED to GREEN at the existing seam", () => {
  const coverage = [
    ["arity-zero", "independent-order"],
    ["arity-one", "shared-order"],
    ["arity-two", "conflict-order"],
    ["arity-many", "composed-operation"],
  ];
  const value = evidenceBoundContract({ compositionDepth: "three-or-more", semantics: ["composition", "ordering"], coverage });
  value.surface.publicSeam = "resolved output";
  value.surface.publicLocator = ".resolved";
  value.surface.constraintSeam = "merge(...sources)";
  value.surface.constraintLocator = "merge(";
  value.cases[0].coverage = value.cases[0].coverage.filter((token) => token !== "constraint-seam");
  value.cases[3].coverage.push("constraint-seam");
  value.cases[3].before = { outcome: "failure", includes: ["MANY_REPRO"] };
  value.cases[3].after = { outcome: "success", includes: ["MANY_FIXED"] };
  assert.deepEqual(validateContract(value).findings, []);

  const greenBefore = structuredClone(value);
  greenBefore.cases[3].before = { outcome: "success", includes: ["MANY_OK"] };
  greenBefore.cases[3].after = { outcome: "success", includes: ["MANY_OK"] };
  assert.match(validateContract(greenBefore).findings.join("\n"), /constraint-seam.*arity-many.*failure.*success/u);
});

test("v4 multi-component coverage enumerates each partial degeneracy and preserved peers", () => {
  const coverage = [
    ["all-populated"],
    ["all-degenerate", "each-one-degenerate"],
    ["each-one-degenerate"],
    [],
  ];
  const value = evidenceBoundContract({ inputShape: "multi-component", components: ["left", "right"], coverage });
  value.cases[1].degenerateComponents = ["left"];
  value.cases[1].preservedComponents = ["right"];
  value.cases[1].oracle = { kind: "relational", assertions: ["left remains empty", "right remains populated"] };
  value.cases[2].degenerateComponents = ["right"];
  value.cases[2].preservedComponents = ["left"];
  value.cases[2].oracle = { kind: "relational", assertions: ["right remains empty", "left remains populated"] };
  const allDegenerate = structuredClone(value.cases[1]);
  allDegenerate.id = "BR-C5";
  allDegenerate.coverage = ["all-degenerate"];
  allDegenerate.degenerateComponents = ["left", "right"];
  allDegenerate.preservedComponents = [];
  allDegenerate.command = "node test/all-degenerate.mjs";
  allDegenerate.proofPath = "test/all-degenerate.mjs";
  value.scope.verificationPaths.push("test/all-degenerate.mjs");
  value.cases.push(allDegenerate);
  assert.deepEqual(validateContract(value).findings, []);

  const collapsed = structuredClone(value);
  collapsed.cases = collapsed.cases.filter((item) => item.degenerateComponents?.[0] !== "right");
  assert.match(validateContract(collapsed).findings.join("\n"), /each-one-degenerate.*right.*preserve.*left/u);
});

test("v3 contract binds public and pre-existing constraint seams", () => {
  const value = profiledContract();
  assert.deepEqual(validateContract(value).findings, []);

  const missingSeam = profiledContract();
  missingSeam.surface.publicSeam = "";
  assert.match(validateContract(missingSeam).findings.join("\n"), /surface\.publicSeam/u);

  const missingPreservation = profiledContract();
  missingPreservation.surface.preserves = [];
  assert.match(validateContract(missingPreservation).findings.join("\n"), /surface\.preserves/u);

  const missingConstraintSeam = profiledContract();
  missingConstraintSeam.surface.constraintSeam = "";
  assert.match(validateContract(missingConstraintSeam).findings.join("\n"), /surface\.constraintSeam/u);
});

test("multi-component surfaces require the complete asymmetric interaction matrix", () => {
  const coverage = [["all-populated"], ["all-degenerate"], ["each-one-degenerate"]];
  assert.deepEqual(validateContract(profiledContract({ inputShape: "multi-component", coverage })).findings, []);

  for (const omitted of ["all-populated", "all-degenerate", "each-one-degenerate"]) {
    const incomplete = profiledContract({ inputShape: "multi-component", coverage });
    for (const item of incomplete.cases) item.coverage = item.coverage.filter((token) => token !== omitted);
    assert.match(validateContract(incomplete).findings.join("\n"), new RegExp(omitted, "u"));
  }
});

test("variadic ordered surfaces require public arities and ordering counterexamples", () => {
  const required = [
    "arity-zero", "arity-one", "arity-two", "arity-many",
    "independent-order", "shared-order", "conflict-order",
  ];
  const coverage = [["arity-two", "independent-order"], ["arity-zero", "arity-one"], ["arity-many", "shared-order"], ["conflict-order"]];
  const complete = profiledContract({ inputShape: "variadic", semantics: ["ordering"], coverage });
  complete.surface.publicSeam = "merge(...contributors)";
  assert.deepEqual(validateContract(complete).findings, []);

  for (const omitted of required) {
    const incomplete = structuredClone(complete);
    for (const item of incomplete.cases) item.coverage = item.coverage.filter((token) => token !== omitted);
    assert.match(validateContract(incomplete).findings.join("\n"), new RegExp(omitted, "u"));
  }
});

test("three-or-more composition requires arity coverage at the existing constraint seam", () => {
  const coverage = [["arity-two", "all-populated"], ["arity-zero", "arity-one", "all-degenerate"], ["arity-many", "each-one-degenerate"], []];
  const complete = profiledContract({ inputShape: "multi-component", semantics: ["composition"], coverage: [[...coverage[0], "composed-operation"], ...coverage.slice(1)] });
  complete.surface.publicSeam = "combined.output";
  complete.surface.constraintSeam = "merge(...sources)";
  complete.surface.compositionDepth = "three-or-more";
  assert.deepEqual(validateContract(complete).findings, []);

  for (const omitted of ["constraint-seam", "arity-zero", "arity-one", "arity-two", "arity-many"]) {
    const incomplete = structuredClone(complete);
    for (const item of incomplete.cases) item.coverage = item.coverage.filter((token) => token !== omitted);
    assert.match(validateContract(incomplete).findings.join("\n"), new RegExp(omitted, "u"));
  }
});

test("semantic traits require matching falsification coverage", () => {
  const requirements = new Map([
    ["representation", "alternate-representation"],
    ["error-contract", "error-contract"],
    ["state-transition", "repeated-transition"],
  ]);
  for (const [semantic, token] of requirements) {
    const complete = profiledContract({ semantics: [semantic], coverage: [[token]] });
    assert.deepEqual(validateContract(complete).findings, [], semantic);
    for (const item of complete.cases) item.coverage = item.coverage.filter((candidate) => candidate !== token);
    assert.match(validateContract(complete).findings.join("\n"), new RegExp(token, "u"), semantic);
  }
});

test("contract requires one primary, two distinct challenges, and one invariant", () => {
  assert.deepEqual(validateContract(regressionContract()).findings, []);

  const missing = regressionContract();
  missing.cases = missing.cases.slice(0, 3);
  assert.match(validateContract(missing).findings.join("\n"), /invariant/u);

  const duplicateDimensions = regressionContract();
  duplicateDimensions.cases[2].dimension = "boundary";
  assert.match(validateContract(duplicateDimensions).findings.join("\n"), /distinct dimensions/u);
});

test("contract requires a primary RED to GREEN transition with distinguishable literal oracles", () => {
  const noPrimaryTransition = regressionContract();
  noPrimaryTransition.cases[0].before.outcome = "success";
  assert.match(validateContract(noPrimaryTransition).findings.join("\n"), /primary.*failure.*success/u);

  const ambiguousOracle = regressionContract();
  ambiguousOracle.cases[0].after.includes = [...ambiguousOracle.cases[0].before.includes];
  assert.match(validateContract(ambiguousOracle).findings.join("\n"), /distinct literal signatures/u);
});

test("contract rejects unknown fields, unsafe paths, and unbounded scope", () => {
  const unknown = regressionContract();
  unknown.surprise = true;
  assert.match(validateContract(unknown).findings.join("\n"), /unknown field: surprise/u);

  const traversal = regressionContract();
  traversal.scope.productionPaths = ["../outside.js"];
  assert.match(validateContract(traversal).findings.join("\n"), /workspace-relative/u);

  const duplicate = regressionContract();
  duplicate.scope.verificationPaths.push("test/primary.mjs");
  assert.match(validateContract(duplicate).findings.join("\n"), /duplicate/u);

  const tooMany = regressionContract();
  tooMany.scope.verificationPaths = Array.from({ length: 21 }, (_, index) => `test/${index}.mjs`);
  assert.match(validateContract(tooMany).findings.join("\n"), /at most 20/u);
});

test("case receipt references are scalar ids rather than one-element arrays", () => {
  const value = regressionContract();
  value.cases[0].receipts.before = ["BR-R1"];
  assert.match(validateContract(value).findings.join("\n"), /receipts\.before.*one scalar BR-RN string/u);
});

test("direct commands reject shell composition and ambiguous byte sequences", () => {
  for (const command of [
    "node test/primary.mjs | tee output.log",
    "node test/primary.mjs > output.log",
    "node test/primary.mjs && echo ok",
    "node test/primary.mjs; echo ok",
    "node `printf test/primary.mjs`",
    "node $(printf test/primary.mjs)",
    "node test/primary.mjs\nnode test/compat.mjs",
  ]) {
    const value = regressionContract();
    value.cases[0].command = command;
    assert.match(validateContract(value).findings.join("\n"), /direct command/u, command);
  }
});

test("plan digest excludes lifecycle and receipts but binds behavior and scope", () => {
  const original = regressionContract();
  const dynamic = structuredClone(original);
  dynamic.status = "closed";
  dynamic.recovery.nextAction = "done";
  dynamic.cases[0].receipts = { before: "BR-R1", after: "BR-R5" };
  assert.equal(planDigest(dynamic), planDigest(original));

  const changed = structuredClone(original);
  changed.cases[0].after.includes = ["A_DIFFERENT_RESULT"];
  assert.notEqual(planDigest(changed), planDigest(original));
});

test("fingerprints cover file bytes, missing files, and reject symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-fingerprint-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "value.txt"), "one\n");
  const first = fingerprintPaths(root, ["src/value.txt", "src/missing.txt"], { allowMissing: true });
  writeFileSync(join(root, "src", "value.txt"), "two\n");
  const second = fingerprintPaths(root, ["src/value.txt", "src/missing.txt"], { allowMissing: true });
  assert.equal(first.ok, true);
  assert.notEqual(first.digest, second.digest);

  symlinkSync(join(root, "src", "value.txt"), join(root, "src", "link.txt"));
  assert.match(fingerprintPaths(root, ["src/link.txt"]).findings.join("\n"), /symlink/u);
});

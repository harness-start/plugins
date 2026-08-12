export function regressionContract() {
  return {
    schema: "behavioral-regression/v3",
    id: "BR-20260809-normalize",
    epoch: 1,
    status: "open",
    recovery: { nextAction: "run the primary baseline", commands: ["node test/primary.mjs"] },
    problem: {
      expected: "legacy and canonical inputs normalize consistently",
      actual: "legacy input is rejected",
      successCriteria: ["primary failure is repaired", "compatibility remains intact"],
    },
    surface: {
      publicSeam: "normalize(value)",
      constraintSeam: "normalize(value)",
      inputShape: "single",
      compositionDepth: "single",
      semantics: ["representation"],
      preserves: ["return representation", "existing supported inputs"],
    },
    scope: {
      productionPaths: ["src/normalize.js"],
      verificationPaths: ["test/primary.mjs", "test/boundary.mjs", "test/representation.mjs", "test/compat.mjs"],
    },
    cases: [
      {
        id: "BR-C1", role: "primary", dimension: "state-transition", coverage: ["primary", "public-seam", "constraint-seam"], cwd: ".",
        command: "node test/primary.mjs",
        before: { outcome: "failure", includes: ["PRIMARY_REPRO"] },
        after: { outcome: "success", includes: ["PRIMARY_FIXED"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C2", role: "challenge", dimension: "boundary", coverage: ["boundary"], cwd: ".",
        command: "node test/boundary.mjs",
        before: { outcome: "success", includes: ["BOUNDARY_OK"] },
        after: { outcome: "success", includes: ["BOUNDARY_OK"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C3", role: "challenge", dimension: "representation", coverage: ["alternate-representation"], cwd: ".",
        command: "node test/representation.mjs",
        before: { outcome: "failure", includes: ["REPRESENTATION_REPRO"] },
        after: { outcome: "success", includes: ["REPRESENTATION_FIXED"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C4", role: "invariant", dimension: "compatibility", coverage: ["compatibility"], cwd: ".",
        command: "node test/compat.mjs",
        before: { outcome: "success", includes: ["COMPAT_OK"] },
        after: { outcome: "success", includes: ["COMPAT_OK"] },
        receipts: { before: null, after: null },
      },
    ],
  };
}

export function witnessedRelationContract() {
  const id = "BR-20260810-peer-witness";
  const proofRoot = `.behavioral-regression/${id}`;
  const relation = (sourceComponent, targetObservation, marker, sourceValue, targetValue) => ({
    sourceComponent,
    targetObservation,
    kind: "value-and-representation",
    marker,
    sourceSample: { value: sourceValue, representation: "array:length=1" },
    targetSample: { value: targetValue, representation: "array:length=1" },
    witnessLocator: `emitRelationWitness("${marker}", ${sourceComponent}, ${targetObservation})`,
  });
  return {
    schema: "behavioral-regression/v8",
    id,
    epoch: 1,
    status: "open",
    recovery: { nextAction: "run every declared BEFORE command", commands: [`node ${proofRoot}/left-empty.mjs`] },
    problem: {
      expected: "a populated channel remains observable when its peer is empty",
      actual: "one empty channel discards both channel results",
      successCriteria: ["each asymmetric boundary preserves the populated peer", "ordinary mapping remains compatible"],
    },
    surface: {
      publicSeam: "mapChannels(left, right)",
      publicLocator: "mapChannels(",
      constraintSeam: "mapChannels(left, right)",
      constraintLocator: "mapChannels(",
      constraintSourcePath: "src/channel-map.cjs",
      callForms: [
        { seam: "public", name: "two channels", locator: "mapChannels(", dataComponents: ["left", "right"], controlInputs: [], variadic: false },
        { seam: "constraint", name: "two channels", locator: "mapChannels(", dataComponents: ["left", "right"], controlInputs: [], variadic: false },
      ],
      inputShape: "multi-component",
      components: ["left", "right"],
      compositionDepth: "single",
      repairMode: "preserve-existing-seam",
      semantics: ["representation"],
      preserves: ["populated channel mapping", "array representation"],
    },
    scope: {
      productionPaths: ["src/channel-map.cjs"],
      verificationPaths: [
        `${proofRoot}/left-empty.mjs`,
        `${proofRoot}/right-empty.mjs`,
        `${proofRoot}/all-empty.mjs`,
        `${proofRoot}/compat.mjs`,
      ],
    },
    cases: [
      {
        id: "BR-C1", role: "primary", dimension: "boundary",
        coverage: ["primary", "public-seam", "constraint-seam", "each-one-degenerate", "boundary"],
        proofPath: `${proofRoot}/left-empty.mjs`,
        oracle: {
          kind: "relational",
          assertions: ["empty left stays empty", "right retains its mapped value and representation"],
          relations: [relation("right", "outputRight", "BR_RELATION_C1_RIGHT", [2], [6])],
        },
        componentSamples: {
          left: { value: [], representation: "array:length=0" },
          right: { value: [2], representation: "array:length=1" },
        },
        degenerateComponents: ["left"], preservedComponents: ["right"], cwd: ".",
        command: `node ${proofRoot}/left-empty.mjs`,
        before: { outcome: "failure", includes: ["LEFT_EMPTY_REPRO"] },
        after: { outcome: "success", includes: ["LEFT_EMPTY_FIXED", "BR_RELATION_C1_RIGHT"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C2", role: "challenge", dimension: "boundary",
        coverage: ["each-one-degenerate", "boundary"],
        proofPath: `${proofRoot}/right-empty.mjs`,
        oracle: {
          kind: "relational",
          assertions: ["empty right stays empty", "left retains its mapped value and representation"],
          relations: [relation("left", "outputLeft", "BR_RELATION_C2_LEFT", [2], [4])],
        },
        componentSamples: {
          left: { value: [2], representation: "array:length=1" },
          right: { value: [], representation: "array:length=0" },
        },
        degenerateComponents: ["right"], preservedComponents: ["left"], cwd: ".",
        command: `node ${proofRoot}/right-empty.mjs`,
        before: { outcome: "failure", includes: ["RIGHT_EMPTY_REPRO"] },
        after: { outcome: "success", includes: ["RIGHT_EMPTY_FIXED", "BR_RELATION_C2_LEFT"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C3", role: "challenge", dimension: "representation",
        coverage: ["all-degenerate", "alternate-representation"],
        proofPath: `${proofRoot}/all-empty.mjs`,
        oracle: { kind: "exact", assertions: ["two empty arrays remain two empty arrays"], relations: [] },
        componentSamples: {
          left: { value: [], representation: "array:length=0" },
          right: { value: [], representation: "array:length=0" },
        },
        degenerateComponents: ["left", "right"], preservedComponents: [], cwd: ".",
        command: `node ${proofRoot}/all-empty.mjs`,
        before: { outcome: "success", includes: ["ALL_EMPTY_OK"] },
        after: { outcome: "success", includes: ["ALL_EMPTY_OK"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C4", role: "invariant", dimension: "compatibility",
        coverage: ["compatibility", "all-populated"],
        proofPath: `${proofRoot}/compat.mjs`,
        oracle: { kind: "compatibility", assertions: ["two populated channels keep their established mapping"], relations: [] },
        componentSamples: {
          left: { value: [2], representation: "array:length=1" },
          right: { value: [3], representation: "array:length=1" },
        },
        degenerateComponents: [], preservedComponents: [], cwd: ".",
        command: `node ${proofRoot}/compat.mjs`,
        before: { outcome: "success", includes: ["COMPAT_OK"] },
        after: { outcome: "success", includes: ["COMPAT_OK"] },
        receipts: { before: null, after: null },
      },
    ],
  };
}

export function witnessedOrderingContract() {
  const value = witnessedRelationContract();
  value.surface.semantics = ["representation", "ordering"];
  const scenarios = [
    {
      kind: "independent-chains",
      contributors: [[1, 2], [3, 4], [5, 6]],
      expected: { order: [1, 3, 5, 2, 4, 6], diagnostics: [] },
      marker: "BR_SCENARIO_INDEPENDENT",
      witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_INDEPENDENT\", independentContributors, independentActual)",
    },
    {
      kind: "shared-prefix",
      contributors: [[1, 2], [1, 3], [1, 4]],
      expected: { order: [1, 2, 3, 4], diagnostics: [] },
      marker: "BR_SCENARIO_SHARED_PREFIX",
      witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_SHARED_PREFIX\", prefixContributors, prefixActual)",
    },
    {
      kind: "shared-suffix",
      contributors: [[1, 4], [2, 4], [3, 4]],
      expected: { order: [1, 2, 3, 4], diagnostics: [] },
      marker: "BR_SCENARIO_SHARED_SUFFIX",
      witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_SHARED_SUFFIX\", suffixContributors, suffixActual)",
    },
    {
      kind: "duplicates",
      contributors: [[1, 2, 2], [2, 3], [1, 3]],
      expected: { order: [1, 2, 3], diagnostics: [] },
      marker: "BR_SCENARIO_DUPLICATES",
      witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_DUPLICATES\", duplicateContributors, duplicateActual)",
    },
    {
      kind: "genuine-cycle",
      contributors: [[1, 2], [2, 1]],
      expected: { order: [1, 2], diagnostics: ["conflict: [1, 2], [2, 1]"] },
      marker: "BR_SCENARIO_CYCLE",
      witnessLocator: "emitScenarioWitness(\"BR_SCENARIO_CYCLE\", cycleContributors, cycleActual)",
    },
  ];
  value.cases[3].oracle.scenarios = scenarios;
  value.cases[3].coverage.push("independent-order", "shared-order", "conflict-order");
  value.cases[3].after.includes.push(...scenarios.map((scenario) => scenario.marker));
  return value;
}

export function sourceBoundVariadicContract() {
  const value = witnessedRelationContract();
  value.schema = "behavioral-regression/v9";
  value.surface.publicSeam = "mapChannels(...channels)";
  value.surface.constraintSeam = "mapChannels(...channels)";
  value.surface.inputShape = "variadic";
  value.surface.components = ["channel-0", "channel-1"];
  value.surface.callForms = value.surface.callForms.map((form) => ({
    ...form,
    name: "separate channels",
    dataComponents: ["channel-0", "channel-1"],
    variadic: true,
    sourcePath: "src/channel-map.cjs",
    signatureLocator: "function mapChannels(...channels)",
  }));
  value.scope.regressionPaths = ["test/channel-map.test.cjs"];
  const bundlePath = `.behavioral-regression/${value.id}/bundle.mjs`;
  value.scope.verificationPaths = [bundlePath];
  for (const item of value.cases) {
    item.proofPath = bundlePath;
    item.componentSamples = Object.fromEntries(Object.entries(item.componentSamples).map(([name, sample], index) => [
      `channel-${index}`,
      sample,
    ]));
    item.degenerateComponents = item.degenerateComponents.map((name) => name === "left" ? "channel-0" : "channel-1");
    item.preservedComponents = item.preservedComponents.map((name) => name === "left" ? "channel-0" : "channel-1");
    for (const relation of item.oracle.relations ?? []) {
      relation.sourceComponent = relation.sourceComponent === "left" ? "channel-0" : "channel-1";
      relation.witnessLocator = `emitRelationWitness("${relation.marker}", ${relation.sourceComponent}, ${relation.targetObservation})`;
    }
    item.coverage.push(...["arity-zero", "arity-one", "arity-two", "arity-many"].filter((token) => !item.coverage.includes(token)));
    if (item.role === "invariant") {
      item.protectedPaths = ["test/channel-map.test.cjs"];
      item.command = "node --test test/channel-map.test.cjs";
      item.before = { outcome: "success", includes: ["PROJECT_COMPAT_OK"] };
      item.after = { outcome: "success", includes: ["PROJECT_COMPAT_OK"] };
    } else {
      item.protectedPaths = [];
      item.command = `node ${bundlePath}`;
      item.before = { outcome: "failure", includes: [`${item.id}_BUNDLE_REPRO`] };
      item.after.outcome = "success";
    }
  }
  return value;
}

export function homogeneousNeutralityContract() {
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  value.surface.interactionModel = "homogeneous-neutrality";
  value.surface.components = [];
  for (const form of value.surface.callForms) form.dataComponents = ["contributors"];
  for (const item of value.cases) {
    item.coverage = item.coverage.filter((token) => !["all-populated", "all-degenerate", "each-one-degenerate"].includes(token));
    item.componentSamples = {};
    item.degenerateComponents = [];
    item.preservedComponents = [];
    item.oracle.relations = [];
    item.after.includes = item.after.includes.filter((literal) => !literal.startsWith("BR_RELATION_"));
  }
  const primary = value.cases.find((item) => item.role === "primary");
  primary.coverage.push("homogeneous-neutrality");
  primary.oracle.neutrality = {
    kind: "homogeneous-neutrality",
    marker: "BR_NEUTRALITY_CONTRIBUTORS",
    populatedArgument: "populated",
    degenerateArgument: "empty",
    populatedSample: { value: [2], representation: "array:length=1" },
    degenerateSample: { value: [], representation: "array:length=0" },
    expectedSample: { value: [2], representation: "array:length=1" },
    singleResultBinding: "singleResult",
    leftResultBinding: "leftResult",
    rightResultBinding: "rightResult",
    singleInvocationLocator: "singleResult = mapChannels(populated)",
    leftInvocationLocator: "leftResult = mapChannels(empty, populated)",
    rightInvocationLocator: "rightResult = mapChannels(populated, empty)",
    witnessLocator: "emitNeutralityWitness(\"BR_NEUTRALITY_CONTRIBUTORS\", populated, empty, singleResult, leftResult, rightResult)",
  };
  primary.after.includes.push("BR_NEUTRALITY_CONTRIBUTORS");
  return value;
}

export function coupledBoundaryContract() {
  const value = sourceBoundVariadicContract();
  value.schema = "behavioral-regression/v10";
  value.surface.interactionModel = "coupled-boundary";
  for (const item of value.cases) {
    item.coverage = item.coverage.filter((token) => !["all-degenerate", "each-one-degenerate"].includes(token));
    item.oracle.relations = [];
    item.degenerateComponents = [];
    item.preservedComponents = [];
    item.componentSamples = {
      "channel-0": { value: [1], representation: "array:length=1" },
      "channel-1": { value: [2], representation: "array:length=1" },
    };
    item.after.includes = item.after.includes.filter((literal) => !literal.startsWith("BR_RELATION_"));
  }
  const primary = value.cases.find((item) => item.role === "primary");
  primary.coverage.push("all-degenerate", "coupled-boundary");
  primary.componentSamples = {
    "channel-0": { value: [], representation: "array:length=0" },
    "channel-1": { value: [], representation: "array:length=0" },
  };
  primary.degenerateComponents = ["channel-0", "channel-1"];
  primary.oracle.kind = "exact";
  primary.oracle.coupledBoundary = {
    kind: "coupled-boundary",
    marker: "BR_COUPLED_BOUNDARY",
    componentArguments: { "channel-0": "emptyLeft", "channel-1": "emptyRight" },
    expectedSample: { value: [[], []], representation: "tuple:length=2;items=array:length=0" },
    rejectedAlternative: { value: null, representation: "error" },
    resultBinding: "emptyResult",
    invocationLocator: "emptyResult = mapChannels(emptyLeft, emptyRight)",
    witnessLocator: "emitCoupledBoundaryWitness(\"BR_COUPLED_BOUNDARY\", emptyLeft, emptyRight, emptyResult)",
  };
  primary.after.includes.push("BR_COUPLED_BOUNDARY");
  return value;
}

export function oracleBoundOrderingContract() {
  const value = witnessedOrderingContract();
  value.schema = "behavioral-regression/v9";
  value.surface.orderingPolicy = "stable-topological-layers";
  value.surface.callForms = value.surface.callForms.map((form) => ({
    ...form,
    sourcePath: "src/channel-map.cjs",
    signatureLocator: "function mapChannels(left, right)",
  }));
  value.scope.regressionPaths = ["test/channel-map.test.cjs"];
  const bundlePath = `.behavioral-regression/${value.id}/bundle.mjs`;
  value.scope.verificationPaths = [bundlePath];
  const scenarios = value.cases[3].oracle.scenarios;
  for (const [index, scenario] of scenarios.entries()) {
    const variable = ["independentContributors", "prefixContributors", "suffixContributors", "duplicateContributors", "cycleContributors"][index];
    scenario.invocationLocator = `mapChannels(...${variable})`;
  }
  value.cases[3].oracle.scenarios = [];
  value.cases[3].coverage = value.cases[3].coverage.filter((token) => !["independent-order", "shared-order", "conflict-order"].includes(token));
  value.cases[3].after.includes = value.cases[3].after.includes.filter((literal) => !scenarios.some((scenario) => scenario.marker === literal));
  value.cases[2].oracle.scenarios = scenarios;
  value.cases[2].coverage.push("independent-order", "shared-order", "conflict-order");
  value.cases[2].after.includes.push(...scenarios.map((scenario) => scenario.marker));
  for (const item of value.cases) {
    item.proofPath = bundlePath;
    if (item.role === "invariant") {
      item.protectedPaths = ["test/channel-map.test.cjs"];
      item.command = "node --test test/channel-map.test.cjs";
      item.before = { outcome: "success", includes: ["PROJECT_COMPAT_OK"] };
      item.after = { outcome: "success", includes: ["PROJECT_COMPAT_OK"] };
    } else {
      item.protectedPaths = [];
      item.command = `node ${bundlePath}`;
      item.before = { outcome: "failure", includes: [`${item.id}_BUNDLE_REPRO`] };
      item.after.outcome = "success";
    }
  }
  return value;
}

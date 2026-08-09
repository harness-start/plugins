export function regressionContract() {
  return {
    schema: "behavioral-regression/v1",
    id: "BR-20260809-normalize",
    epoch: 1,
    status: "open",
    recovery: { nextAction: "run the primary baseline", commands: ["node test/primary.mjs"] },
    problem: {
      expected: "legacy and canonical inputs normalize consistently",
      actual: "legacy input is rejected",
      successCriteria: ["primary failure is repaired", "compatibility remains intact"],
    },
    scope: {
      productionPaths: ["src/normalize.js"],
      verificationPaths: ["test/primary.mjs", "test/boundary.mjs", "test/representation.mjs", "test/compat.mjs"],
    },
    cases: [
      {
        id: "BR-C1", role: "primary", dimension: "state-transition", cwd: ".",
        command: "node test/primary.mjs",
        before: { outcome: "failure", includes: ["PRIMARY_REPRO"] },
        after: { outcome: "success", includes: ["PRIMARY_FIXED"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C2", role: "challenge", dimension: "boundary", cwd: ".",
        command: "node test/boundary.mjs",
        before: { outcome: "success", includes: ["BOUNDARY_OK"] },
        after: { outcome: "success", includes: ["BOUNDARY_OK"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C3", role: "challenge", dimension: "representation", cwd: ".",
        command: "node test/representation.mjs",
        before: { outcome: "failure", includes: ["REPRESENTATION_REPRO"] },
        after: { outcome: "success", includes: ["REPRESENTATION_FIXED"] },
        receipts: { before: null, after: null },
      },
      {
        id: "BR-C4", role: "invariant", dimension: "compatibility", cwd: ".",
        command: "node test/compat.mjs",
        before: { outcome: "success", includes: ["COMPAT_OK"] },
        after: { outcome: "success", includes: ["COMPAT_OK"] },
        receipts: { before: null, after: null },
      },
    ],
  };
}

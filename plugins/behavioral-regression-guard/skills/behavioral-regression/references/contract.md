# Contract reference

Create exactly one JSON file at `.behavioral-regression/<id>.json`. Paths are workspace-relative POSIX file paths; directories and symlinks are rejected. Keep each path list at 20 entries or fewer.

```json
{
  "schema": "behavioral-regression/v11",
  "id": "BR-20260809-stable-name",
  "epoch": 1,
  "status": "open",
  "recovery": {
    "nextAction": "run every declared BEFORE command",
    "commands": [
      "node .behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "node --test test/normalize.test.js"
    ]
  },
  "problem": {
    "expected": "supported input preserves its documented behavior",
    "actual": "the same input produces an incorrect result",
    "successCriteria": [
      "the primary reproduction succeeds",
      "challenge and compatibility behavior remains correct"
    ]
  },
  "surface": {
    "publicSeam": "normalize(value)",
    "publicLocator": "normalize(",
    "constraintSeam": "normalize(value)",
    "constraintLocator": "normalize(",
    "constraintSourcePath": "src/subject.js",
    "callForms": [
      {
        "seam": "public",
        "name": "one value",
        "locator": "normalize(",
        "sourcePath": "src/subject.js",
        "signatureLocator": "export function normalize(value)",
        "dataComponents": ["value"],
        "controlInputs": [],
        "variadic": false
      },
      {
        "seam": "constraint",
        "name": "one value",
        "locator": "normalize(",
        "sourcePath": "src/subject.js",
        "signatureLocator": "export function normalize(value)",
        "dataComponents": ["value"],
        "controlInputs": [],
        "variadic": false
      }
    ],
    "inputShape": "single",
    "components": [],
    "compositionDepth": "single",
    "repairMode": "preserve-existing-seam",
    "semantics": ["representation"],
    "preserves": ["return representation", "existing supported inputs"]
  },
  "scope": {
    "productionPaths": ["src/subject.js"],
    "verificationPaths": [".behavioral-regression/BR-20260809-stable-name/bundle.mjs"],
    "regressionPaths": ["test/normalize.test.js"]
  },
  "cases": [
    {
      "id": "BR-C1",
      "role": "primary",
      "dimension": "state-transition",
      "coverage": ["primary", "public-seam", "constraint-seam"],
      "proofPath": ".behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "oracle": { "kind": "exact", "assertions": ["legacy input equals the canonical normalized value"] },
      "cwd": ".",
      "command": "node .behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "before": { "outcome": "failure", "includes": ["PRIMARY_REPRO"] },
      "after": { "outcome": "success", "includes": ["PRIMARY_FIXED"] },
      "receipts": { "before": null, "after": null }
    },
    {
      "id": "BR-C2",
      "role": "challenge",
      "dimension": "boundary",
      "coverage": ["boundary"],
      "proofPath": ".behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "oracle": { "kind": "exact", "assertions": ["minimum supported input remains accepted"] },
      "cwd": ".",
      "command": "node .behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "before": { "outcome": "failure", "includes": ["BOUNDARY_REPRO"] },
      "after": { "outcome": "success", "includes": ["BOUNDARY_FIXED"] },
      "receipts": { "before": null, "after": null }
    },
    {
      "id": "BR-C3",
      "role": "challenge",
      "dimension": "representation",
      "coverage": ["alternate-representation"],
      "proofPath": ".behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "oracle": { "kind": "exact", "assertions": ["alternate representation produces the same value and container"] },
      "cwd": ".",
      "command": "node .behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "before": { "outcome": "failure", "includes": ["REPRESENTATION_REPRO"] },
      "after": { "outcome": "success", "includes": ["REPRESENTATION_FIXED"] },
      "receipts": { "before": null, "after": null }
    },
    {
      "id": "BR-C4",
      "role": "invariant",
      "dimension": "compatibility",
      "coverage": ["compatibility"],
      "proofPath": ".behavioral-regression/BR-20260809-stable-name/bundle.mjs",
      "oracle": { "kind": "compatibility", "assertions": ["canonical supported input remains unchanged"] },
      "protectedPaths": ["test/normalize.test.js"],
      "cwd": ".",
      "command": "node --test test/normalize.test.js",
      "before": { "outcome": "success", "includes": ["COMPAT_OK"] },
      "after": { "outcome": "success", "includes": ["COMPAT_OK"] },
      "receipts": { "before": null, "after": null }
    }
  ]
}
```

## Surface-driven coverage

`surface.publicSeam` names the externally observable entry point. `surface.constraintSeam` names the lowest pre-existing operation that turns the original inputs into output constraints; it may equal the public seam, but it must not name a helper that will only exist after the fix or a higher-level consumer that merely calls the real combiner. `constraintSourcePath` must name one file in `scope.productionPaths`, and its baseline bytes must already contain `constraintLocator`. `publicLocator` and `constraintLocator` are also exact source fragments found in the corresponding proof file when that seam is claimed. For `compositionDepth: three-or-more`, `constraintLocator` must contain `(` and identify the callable combiner rather than a consuming property.

`callForms` enumerates every supported invocation shape visible in the request, signature, docs, or tests for both seams. Each form's `sourcePath` names a file in `scope.productionPaths`, and `signatureLocator` must name the same callable as the form locator and resolve to its complete signature already present there. The loader parses that complete source signature, so neither a locator truncated before `*args` or `...args` nor a fixed-arity nested helper can disguise a variadic form as fixed. If `repairMode: extend-existing-seam` intentionally evolves a fixed declaration to variadic, freeze the real baseline locator and set every form of that callable's target `variadic` field to `true`; once edited, the missing old locator is accepted only when Git contains exactly one matching fixed baseline declaration and current source contains exactly one same-level variadic declaration of that callable. `preserve-existing-seam` never receives that exception. `dataComponents` are independently mutable behavioral inputs; origins, options, flags, contexts, and callbacks belong in `controlInputs`. The validator derives `inputShape`: any variadic form yields `variadic`; otherwise any form with at least two data components yields `multi-component`; otherwise it is `single`. For multi-component and v10 variadic representation surfaces, use one of three models. Independently meaningful axes, channels, fields, or positions use the component matrix. Named components that domain rules permit to degenerate only together use `interactionModel: "coupled-boundary"` and retain 2–8 component names. A genuinely homogeneous aggregate whose empty contributor is neutral may use `homogeneous-neutrality`, one conceptual contributor collection in each form's `dataComponents`, and `components: []`. Do not use `coupled-boundary` when a single-component degenerate input is valid. Other shapes use `[]`.

`coupled-boundary` is fail-closed at activation: the frozen original task must explicitly state that components must degenerate together, or explicitly state that a partial-degenerate input is invalid, unsupported, or forbidden. One all-degenerate example does not establish that exclusion. Without explicit task evidence, use `component-matrix` and cover each component degenerate while every other peer is populated and preserved.

`compositionDepth` is `single`, `pairwise`, or `three-or-more`. `repairMode` is `preserve-existing-seam` unless the existing constraint operation must be generalized; three-or-more composition requires `extend-existing-seam`. Declare every applicable `semantics` value from `composition`, `ordering`, `representation`, `error-contract`, `state-transition`, and `concurrency`; use an empty array only when none applies. v10 treats behavioral vocabulary anywhere in problem, surface, case dimension/coverage, or oracle assertions as binding: order, sequence, dependency, topological, or precedence claims require `ordering`; representation, container, tuple, deduplication, array-shape, shape-matching, or claims that an operation returns/produces/yields a list, tuple, array, or container require `representation`. Preserve the user's concrete terms instead of weakening or moving a claim to evade a semantic branch. `preserves` records concrete compatibility obligations such as return container, warning text, exception class, or previously supported inputs.

Every case has one or more `coverage` tokens. All contracts require `primary`, `public-seam`, `constraint-seam`, and `compatibility`. Additional required tokens are derived mechanically:

| Declaration | Required coverage |
| --- | --- |
| `multi-component` (`component-matrix`) | `all-populated`, `all-degenerate`, `each-one-degenerate` |
| `multi-component` (`coupled-boundary`) | `all-populated`, `all-degenerate`, `coupled-boundary` |
| `variadic` | `arity-zero`, `arity-one`, `arity-two`, `arity-many` |
| `compositionDepth: three-or-more` | `arity-zero`, `arity-one`, `arity-two`, `arity-many` |
| `ordering` | `independent-order`, `shared-order`, `conflict-order` |
| `representation` | `alternate-representation` |
| `error-contract` | `error-contract` |
| `state-transition` | `repeated-transition` |
| `composition` | `composed-operation` |
| `concurrency` | `concurrent-interleaving` |

v11 has exactly four cases: one primary, two challenges in distinct dimensions, and one compatibility invariant. The first three share the only `scope.verificationPaths` file and the same direct command; that bundle emits each case's distinct signatures, so one execution can issue all matching receipts. Project-owned tests go in `scope.regressionPaths`; they must be tracked, production-adjacent, contain the public or constraint locator, and remain byte-identical to their Git baseline. Make the public-seam RED before activation in the isolated bundle. Describe an intentionally changed baseline expectation through the metadata-only supersession below; do not apply that target replacement to the project test. The compatibility invariant runs a directly relevant project-test slice whose behavior the task does not intentionally change, lists its regression files in `protectedPaths`, and stays successful before and after. Do not put a superseded expectation into the invariant. All isolated and project paths freeze together at the first BEFORE receipt. `public-seam` and `constraint-seam` coverage is rejected when the shared proof does not contain the corresponding exact locator. Do not label a helper-only or unrelated test as either seam.

An ordering supersession has this exact shape:

```json
{
  "path": "test/merge.test.js",
  "beforeAssertion": "assert.deepEqual(merge([1, 2], [3, 4]), [1, 2, 3, 4]);",
  "afterAssertion": "assert.deepEqual(merge([1, 2], [3, 4]), [1, 3, 2, 4]);",
  "inputLiterals": ["[1, 2]", "[3, 4]"],
  "assertionForm": "call",
  "expectedOperandIndex": 1,
  "beforeExpectedLiteral": "[1, 2, 3, 4]",
  "afterExpectedLiteral": "[1, 3, 2, 4]",
  "valueCodec": "json",
  "reason": "the stable-layer policy intentionally supersedes the eager binary expectation",
  "targetCaseId": "BR-C3",
  "scenarioMarker": "BR_SCENARIO_INDEPENDENT_PAIR"
}
```

Keep `scope.supersededAssertions` as an array of at most 20 entries. Ordering semantics require at least one entry because the stable-layer oracle intentionally replaces a discriminating baseline expectation. A task without ordering semantics uses `[]`; never manufacture an unrelated baseline replacement merely to activate v11. Each entry is a machine-bound description of target semantics, not permission to edit the project test. `assertionForm: call` parses an assertion-like outer call, requires a non-expected operand to invoke the declared seam, and forbids the expected operand from invoking it. `assertionForm: sequence` parses an outer tuple/parameter row after its trailing comma is removed and additionally requires `consumerLocator`: one Git-baseline source line that invokes the public or constraint seam and consumes the row. `expectedOperandIndex` must identify a top-level operand equal to the complete before/after expected literal. Each input literal must occur exactly once, in order, outside and before that operand, parse as JSON, and equal the referenced scenario contributors. The described after line must be the before line with only this expected operand replaced, and the replacement must equal that scenario's machine-derived `expected.order`. The baseline assertion target is unique. The loader reads that target from `git show HEAD:<path>` and separately requires the current regression file to remain byte-identical to Git baseline; diff drivers and source lines beginning with `--` or `++` cannot alter this decision. This is not a test-rewrite escape hatch.

For a parameterized row such as `(([1, 2], [3, 4]), [1, 2, 3, 4]),`, use `assertionForm: sequence`, `expectedOperandIndex: 1`, and a consumer that exists in the Git baseline, such as `consumerLocator: "self.assertEqual(Media.merge(list1, list2), expected)"`; the first top-level operand contains the contributors and the second is the expected value. A target-only consumer such as a future variadic call is not baseline evidence.

For `three-or-more`, at least one case must combine `constraint-seam` and `arity-many` and transition from failure BEFORE to success AFTER. This makes a parallel helper insufficient: the original constraint seam must itself support the repaired behavior.

For `multi-component` and every v10 variadic representation surface, cases also bind `degenerateComponents` and `preservedComponents`. Non-interaction surfaces may omit both arrays, and isolated cases may omit an empty `protectedPaths`. `all-populated` has no degenerate components; `all-degenerate` names all components and no preserved peers. For every concrete component or positional slot, a separate `each-one-degenerate` case with `oracle.kind: relational` must name that component alone as degenerate and name all peers as preserved. Do not combine two one-degenerate relations in one case: it becomes all-degenerate and proves no peer preservation. With two components, the simplest four-case allocation is all-degenerate primary, one relational challenge per component, and the all-populated compatibility invariant; equivalent role allocations remain valid when all requirements hold.

A `coupled-boundary` surface replaces invalid partial-peer cases with exactly one all-degenerate boundary case containing this source-bound object:

```json
{
  "kind": "coupled-boundary",
  "marker": "BR_COUPLED_BOUNDARY",
  "componentArguments": { "x": "emptyX", "y": "emptyY" },
  "expectedSample": { "value": [[], []], "representation": "tuple:length=2;items=array:length=0" },
  "rejectedAlternative": { "value": null, "representation": "error" },
  "resultBinding": "emptyResult",
  "invocationLocator": "emptyResult = transform(emptyX, emptyY, origin)",
  "witnessLocator": "emitCoupledBoundaryWitness(\"BR_COUPLED_BOUNDARY\", emptyX, emptyY, emptyResult)"
}
```

That case has `coupled-boundary`, `all-degenerate`, and `boundary` coverage, freezes every component in `componentSamples`, names all of them as degenerate, and has no preserved peers. Each component argument is a distinct bare identifier used exactly once as a top-level argument by the one assigned seam call; control arguments may remain. The witness directly passes marker, original arguments in surface order, and that result. Runtime prints `<marker> {"components":<componentSamples>,"actual":<same-call expectedSample>}`. The expected sample and rejected alternative must differ. A second seam call, rebind, result mutation, missing component, hardcoded witness result, or any `each-one-degenerate` claim rejects the contract.

A `homogeneous-neutrality` aggregate does not use that matrix. Exactly one primary or challenge case adds `homogeneous-neutrality` coverage and this `oracle.neutrality` object (names may vary, structure may not):

```json
{
  "kind": "homogeneous-neutrality",
  "marker": "BR_NEUTRALITY_CONTRIBUTORS",
  "populatedArgument": "populated",
  "degenerateArgument": "empty",
  "populatedSample": { "value": [2], "representation": "list:length=1" },
  "degenerateSample": { "value": [], "representation": "list:length=0" },
  "expectedSample": { "value": [2], "representation": "list:length=1" },
  "singleResultBinding": "singleResult",
  "leftResultBinding": "leftResult",
  "rightResultBinding": "rightResult",
  "singleInvocationLocator": "singleResult = merge(populated)",
  "leftInvocationLocator": "leftResult = merge(empty, populated)",
  "rightInvocationLocator": "rightResult = merge(populated, empty)",
  "witnessLocator": "emitNeutralityWitness(\"BR_NEUTRALITY_CONTRIBUTORS\", populated, empty, singleResult, leftResult, rightResult)"
}
```

The four locators form one adjacent block in the frozen proof. The three invocations must call the declared constraint seam with the exact argument orders shown; the witness directly receives both original arguments and all three unreassigned results. AFTER prints exactly one JSON payload with `populated`, `degenerate`, `single`, `left`, and `right`; the hook compares the first two with their frozen samples and all three results with `expectedSample`. This option is for a true aggregate operation such as merging same-role contributor lists. It is invalid for WCS axes or other same-typed positions with distinct output roles, because `F(E,P)` and `F(P,E)` are not neutral-equivalent to the one-input form.

Every multi-component case also declares `componentSamples`, keyed by every `surface.components` name. Samples use `{ "value": ..., "representation": "..." }`. A partial case must reuse the exact `all-degenerate` sample for its degenerate component, while every preserved peer must differ from its all-degenerate sample. This prevents an empty boundary from being silently replaced by a one-element minimum. In v10, when the behavioral claims explicitly name an empty or zero-sized input-container boundary, each canonical all-degenerate value must itself be structurally empty (`[]`, `""`, `{}`, or a nested array with no scalar leaf); nonempty sentinels such as `[0]`, `[false]`, and `[null]` cannot stand in for that input family. Each preserved peer must contain a scalar/populated leaf, so hollow shapes such as `[[], []]` cannot masquerade as a populated peer. An empty output claim alone does not activate this rule.

Every preserved peer also requires one `oracle.relations` entry. v10 binds the observation to the same invocation that used the frozen component matrix:

```json
{
  "sourceComponent": "right",
  "targetObservation": "output.right",
  "resultBinding": "output",
  "componentArguments": { "left": "left", "right": "right" },
  "invocationLocator": "output = mapChannels(left, right)",
  "kind": "value-and-representation",
  "marker": "BR_RELATION_C2_RIGHT",
  "sourceSample": { "value": [2], "representation": "array:length=1" },
  "targetSample": { "value": [6], "representation": "array:length=1" },
  "witnessLocator": "emitRelationWitness(\"BR_RELATION_C2_RIGHT\", right, output.right)"
}
```

`targetObservation` must select the complete peer output using exactly one immediate property or index selector on `resultBinding`. Nested selectors such as `result[1].shape`, `result[1].ndim`, or `result.right.length` observe metadata instead of the value and cannot prove preservation. This does not require `targetSample` to equal `sourceSample`; a legitimate mapping such as `[2]` to `[6]` remains valid.

Put the marker in that case's AFTER `includes`. Both samples use the JSON shape `{ "value": ..., "representation": "..." }`; source and target must be non-degenerate for a preserved peer. `sourceSample` captures the original peer before preprocessing. `targetSample` is the independently derived expected mapped value and representation, so preservation may include a legitimate transformation such as `[2]` to `[6]`. `componentArguments` maps every declared logical component to a distinct bare identifier that occurs exactly once as a top-level argument in `invocationLocator`. That locator is one direct real public/constraint seam call assigned to `resultBinding`. `targetObservation` is a pure property/index selector on that binding, never a boolean fallback, conditional, call, or expression involving another result. `witnessLocator` passes `componentArguments[sourceComponent]` exactly—not a similarly named or separately populated variable. Between invocation and witness, the proof may not call either seam again, rebind a component, or reassign/mutate the result. A result from a separate all-populated call is not evidence for a partial-input relation.

The frozen proof file must contain `witnessLocator`, which names the relation marker, original source component expression, and actual target observation. Every custom identifier-form witness callable must also have a matching function definition in that proof; changing an undefined typo to a non-`emit` prefix is not an escape. Dotted custom callees are rejected because their object or import ownership cannot be source-bound by this contract; only the documented built-in output callees remain available without a local definition. Only after comparing the actual observation should the probe print exactly one JSON line:

```text
BR_RELATION_C2_RIGHT {"components":{"left":{"value":[],"representation":"array:length=0"},"right":{"value":[2],"representation":"array:length=1"}},"source":{"value":[2],"representation":"array:length=1"},"target":{"value":[6],"representation":"array:length=1"}}
```

The hook requires exactly one marker payload, then independently compares the complete component matrix and both sides with the frozen samples before issuing an AFTER receipt. A bare or duplicated marker, aggregate empty result, broadcasted replacement for the source, changed boundary sample, shared shape, length, or truthiness check is not relation evidence.

## Ordering scenarios

When `surface.semantics` contains `ordering`, set `surface.orderingPolicy` to `stable-topological-layers` and put all six scenario kinds in one ordering challenge case by default: `independent-pair`, `independent-chains`, `shared-prefix`, `shared-suffix`, `duplicates`, and `genuine-cycle`. `scenarios` is not allowed at the contract root; its only location is `cases[i].oracle.scenarios`. Split them only when one direct runtime cannot exercise them together. Example (the object shown is one entry inside a case's `oracle.scenarios` array):

```json
{
  "kind": "shared-prefix",
  "contributors": [["a", "b"], ["a", "c"], ["a", "d"]],
  "expected": { "order": ["a", "b", "c", "d"], "diagnostics": [] },
  "marker": "BR_SCENARIO_SHARED_PREFIX",
  "contributorsBinding": "prefixContributors",
  "observationBinding": "prefixObservation",
  "invocationLocator": "prefixObservation = observeScenario(() => mergeOrders(...prefixContributors))",
  "witnessLocator": "emitScenarioWitness(\"BR_SCENARIO_SHARED_PREFIX\", prefixContributors, prefixObservation.order, prefixObservation.diagnostics)"
}
```

`invocationLocator` must contain the exact `surface.constraintLocator`, appear in the frozen proof, and assign one warning/diagnostic observation of that real seam call to `observationBinding`; the observation helper must be defined in the proof and accept exactly one opaque zero-argument seam thunk. Do not pass `contributorsBinding` as a separate helper argument. In v11, `witnessLocator` passes exactly the marker, `contributorsBinding`, and the observation's direct order and diagnostics fields: use `observationBinding.order` / `observationBinding.diagnostics` for objects, or `observationBinding["order"]` / `observationBinding["diagnostics"]` for mappings. It may not substitute a contract-shaped diagnostic literal, and no second seam call or observation mutation may occur before that witness. A `genuine-cycle` also declares `diagnosticProjection`: use `{"sourceKind":"python-warning-record","sourceBinding":"caught","valueSelector":"message"}` when the helper surrounds its one thunk call with `warnings.catch_warnings(record=True) as caught` and directly returns the canonical mapping `return {"order": result, "diagnostics": [str(item.message) for item in caught]}`. Returning an object wrapper such as `SimpleNamespace` is not the canonical statically checked shape. Use `{"sourceKind":"seam-result-field","sourceBinding":"rawObservation","valueSelector":"self"}` only when the same thunk directly returns canonical `{order, diagnostics}` data and the helper returns `rawObservation.diagnostics.map((item) => String(item))`. These are identity projections: filtering, prefixes, localization, contributor-based formatting, alternate returns, source mutation, or shadowing `str`/`String` is rejected. In v10/v11, `independent-pair` has exactly two disjoint, internally duplicate-free sequences of at least two distinct items, while `independent-chains` needs at least three pairwise-disjoint, internally duplicate-free sequences, every sequence has at least two distinct items, and one sequence has at least three. Together they prove binary policy and distinguish an atomic ready layer from an eager release that incorrectly admits a newly unlocked successor into the current layer; singleton and repeated-node pseudo chains are rejected because they erase that distinction. A `duplicates` scenario separately repeats at least one value within one sequence or across sequences. Put every marker in its case's AFTER `includes`, and print `<marker> {"contributors":...,"actual":{"order":...,"diagnostics":...}}` only after observing that call. For acyclic scenarios, the validator independently computes complete ready layers and emits each layer in first-seen order before considering newly unlocked nodes. For a cycle, it independently derives the first-seen unique fallback; `expected.diagnostics` is an array of non-empty strings whose combined text contains `JSON.stringify(contributor)` for every original contributor sequence, for example `["cycle: [\"a\",\"b\"] conflicts with [\"b\",\"a\"]"]`. Runtime matching requires exact contributor, order, and diagnostics equality. Bind a warning that the task intentionally changes in the genuine-cycle scenario itself; use a separate compatibility invariant only when the task explicitly requires the warning text to remain unchanged.

`status`, `recovery`, and receipt references may change without replanning. Changes to the problem, scope, commands, expectations, or cases change the frozen plan. Replanning is allowed only while production files still match the activation baseline.

Contract activation also compares the workspace with the failure-probe snapshot. If an abandoned managed sibling or Python cache file was created after that snapshot, do not add it to `verificationPaths` merely to silence the finding. The recovery card may provide one exact `rm -f -- ...` command containing only hook-verified files that were absent at probe time. Run that command verbatim, then retry the existing contract. Recursive deletion, tracked paths, declared verification assets, and unrelated files are never authorized by this rollback path.

`paused` and `aborted` release Stop only at that unchanged baseline. They continue to protect every declared production path from edits; reopen the next epoch and rebuild the evidence workflow before continuing the repair.

## Independent high-risk review

Claude derives a dual independent-review policy when a contract contains ordering or concurrency, `compositionDepth: three-or-more`, multi-component input, or variadic representation. This policy is hook-owned; the contract author cannot disable it.

After every BEFORE receipt is referenced and before production changes, dispatch a read-only subagent with a prompt containing only:

```text
BR_REVIEW_REQUEST <contract-id> oracle
```

`PreToolUse` reserves the request. `SubagentStart` binds the real agent id—even when the host omits the dispatch prompt from that event—and injects the problem/surface and candidate-case projection, deterministic challenge pack, declared production/project-test anchors, checked dimensions, nonce, and result schema. It omits the proof bundle, parent implementation proposal, and prior conclusions. If a host drops that start context or a result is rejected, `SubagentStop` returns the exact nonce/result schema and the original typed challenge inputs plus policy names for correction while continuing to hide expected and alternative outputs. Each machine card includes answer-free slot-specific shapes: `valueShape` applies to `derivedExpected`, `contrastValueShape` to `rejectedAlternative`, and patch-stage `observedValueShape` to `observedActual`. They reveal only JSON field/type structure, never hidden values; do not copy one slot's shape into another. When a machine result contains a `representation` string, its card also includes an answer-free `representationGrammar`. Encode source-derived container names, nesting, and lengths exactly with that grammar: an equivalent prose label is not the same machine value, while the concrete descriptor and oracle value remain hidden. Source-language semantics decide the names—a Python bracket comprehension is `list`, a tuple literal is `tuple`, and a NumPy slice or reshape is `array`—and the JSON value must mirror every descriptor length. For a coupled-boundary card, apply that grammar to both results. Its independently checked contrast must match the advertised contrast value shape, but the reviewer is not required to guess an author-selected hidden representation label. The reviewer independently derives the values, expected behavior, distinct rejected shortcut, and concrete counterexample. For stable layers it freezes all current indegree-zero nodes, emits the whole layer in first-seen order, and only then admits newly unlocked nodes; the eager contrast admits them after each individual removal. `BR_REVIEW_RESULT` is accepted only when it is the unique final non-empty line. During the reservation, only Read/Grep against an exact `evidencePaths` entry is allowed; every declared entry must be observed and echoed in `evidenceAnchors`. `SubagentStop` validates those lifecycle observations together with the nonce, agent, checked dimensions, challenge ids, and result shape before writing a hook-owned approval bound to the current plan, baseline production bytes, and frozen verification bytes. Machine-checkable result fields are raw JSON values, not prose or JSON encoded inside strings. Oracle-stage disposition compares the independent derivation with the contract oracle, not with the known-bad baseline implementation: use `contract-conforms` when the derivation matches the contract even though baseline code still fails. A structured `contract-conflicts` result is only for a genuinely different derivation; it keeps that result in `derivedExpected`, supplies an independently rejected alternative using its own advertised shape, and records decision `challenge`, which forces replan. The reviewer must not guess or echo the hidden contract oracle; the hook performs that comparison. A current approval is reused across lifecycle-only contract edits and may not be replaced by redundant dispatch. A workspace JSON file or parent-authored text is not a review receipt.

The independent challenge pack does not repeat a `genuine-cycle` exact diagnostic card. A contract may choose any task-appropriate diagnostic text that names every frozen contributor, so a hidden author-selected string has no unique independent derivation. Cycle integrity remains a hard machine gate: the loader binds one real seam call to an identity projection of captured warnings, and BEFORE/AFTER receipt matching requires exact contributors, fallback order, and diagnostic strings. The reviewer instead challenges the independently derivable ordering policy, supersession, direct-many composition, and representation obligations.

Oracle reviewers inspect baseline production and project tests. Patch reviewers inspect current production and every declared project-test path, compare them with the task and candidate cases, and must account for any observed suite failures; a baseline-only patch review is not sufficient.

After `status: closed`, verification and project regression paths remain frozen at PreToolUse. For v4-v10, add or revise authorized project regressions before the first BEFORE receipt; a post-close test change requires reopening a new epoch from the production baseline. For v11, every `regressionPath` remains byte-identical to Git baseline throughout the lifecycle, and `supersededAssertions` is metadata only.

For a high-risk open contract, a child agent without a successful hook reservation is inert: `SubagentStart` tells it to return and PreToolUse denies every child tool. Dispatch the exact `BR_REVIEW_REQUEST` only after the required phase receipts exist; a rejected or premature request cannot fall back to an ordinary implementer or author its own proof.

After all AFTER receipts are referenced but while the contract is still open, dispatch `BR_REVIEW_REQUEST <contract-id> patch` to a different subagent. Its approval binds the current production fingerprint. Any replan, verification change, later production edit, reused oracle agent, missing lifecycle event, or `challenge` decision leaves the gate closed. Ordinary unrelated `SubagentStop` events are no-ops and never run the parent completion check.

Codex currently lacks the complete dispatch/start event chain used for hard provenance. It therefore keeps these reviews advisory and relies on the deterministic contract, frozen receipts, and fingerprints; do not describe a Codex subagent result as a lifecycle-proven approval.

Pause or abort before handing off. To resume in another session, first release the prior lease by pausing, then increment `epoch` by exactly one without changing the frozen plan. Valid BEFORE receipts survive that resume; AFTER receipts do not.

The production pre-gate covers both structured file-edit tools and shell commands with explicit mutation primitives. Inline writers such as Python `open(path, 'w')`, output redirection, `tee`, `sed -i`, and Node `writeFile` cannot run while BEFORE evidence or the required oracle approval is incomplete. Use file-edit tools for proof and production changes so scope remains observable; ordinary inspection and declared verification commands continue through the normal command path.

Each `includes` literal is a behavioral oracle, not decoration. Make BEFORE and AFTER signatures phase-specific whenever behavior changes. Empty v10 receipt objects may be omitted initially; after a hook issues ids, add `receipts: {"before": ..., "after": ...}` to the matching case. A BEFORE case with `outcome: failure` must make the shared proof command exit non-zero while the bug is present; a marker plus exit zero cannot issue a failure receipt. Claude can bind exit status or a failure event in addition to these literals. A single trailing `; echo "name=$?"` is recognized as diagnostic status reporting and normalized back to the declared command. Once the first BEFORE receipt freezes verification bytes, PreToolUse rejects edits to verification paths and to v4-v10 regression paths; restore the production baseline and replan before revising them. V11 regression paths are immutable Git-baseline evidence in every phase and must never be revised. Codex unified execution may expose only raw response text; in that case the hook issues a visibly weaker `literal-oracle` receipt against the frozen verification bytes and never claims to have observed an exit status.

The schema requires at least one primary case to move from failure BEFORE to success AFTER. Any case whose expected outcome changes must also use distinct BEFORE and AFTER literal-signature sets, so a Codex `literal-oracle` receipt cannot represent unchanged output as a behavioral transition.

# reasoning-workflow/v1 artifact protocol

Each Markdown file contains exactly one machine block. Narrative outside the block is optional and is never machine evidence. Do not add fields that are absent from these templates.

Write each artifact in its own observable file-tool call (Codex: `apply_patch`; Claude Code: Write/Edit). Shell-based file writes cannot receive a guard receipt and are invalid for this protocol.

## Workflow manifest

```json reasoning-workflow/v1
{
  "schema": "reasoning-workflow/v1",
  "id": "RW-20260809-short-slug",
  "status": "open",
  "branch": "exact",
  "question": "precise question",
  "successCriteria": ["observable condition for a satisfactory conclusion"],
  "run": { "epoch": 1 },
  "currentStage": "frame",
  "completionReceipt": null,
  "resume": {
    "nextStage": "frame",
    "nextAction": "state givens, assumptions, ambiguities, and strategy variables"
  }
}
```

`branch` is `exact`, `causal`, or `decision`. `status` is `open`, `paused`, `closed`, or `aborted`.

## 01-frame.md

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "exact",
  "stage": "frame",
  "previousReceipt": null,
  "payload": {
    "givens": [
      { "id": "G1", "statement": "explicit given", "source": "user prompt" }
    ],
    "assumptions": [
      { "id": "A1", "statement": "falsifiable assumption", "source": "inference", "falsifier": "observation that rejects it" }
    ],
    "ambiguities": [
      { "id": "U1", "statement": "material ambiguity", "impact": "how answers differ", "resolution": "chosen reading or user answer" }
    ],
    "strategyVariables": [
      { "id": "S1", "kind": "allocation", "statement": "allocation choice available before the hidden response", "components": ["categoryOneCount", "categoryTwoCount"], "alternatives": ["allocation one", "allocation two"] }
    ],
    "controlAssignments": [
      {
        "id": "R1",
        "strategyRef": "S1",
        "dimension": "candidate controllable dimension",
        "controller": "participant",
        "timing": "before the environment response",
        "basis": "textual reason for this assignment",
        "alternative": "strongest plausible alternate controller",
        "impact": "how the alternate assignment changes the result"
      },
      {
        "id": "R2",
        "strategyRef": null,
        "dimension": "hidden response dimension",
        "controller": "adversary",
        "timing": "after the participant strategy",
        "basis": "textual reason that this value is hidden",
        "alternative": "strongest plausible participant-control reading",
        "impact": "how that alternate reading changes the result"
      }
    ],
    "observabilityAudit": [
      {
        "id": "O1",
        "dimension": "action-time category or hidden attribute",
        "sourceRef": "G1",
        "observable": true,
        "controlEffect": "allocation",
        "timing": "when the participant can distinguish it",
        "strategyRef": "S1",
        "overrideSourceRef": null,
        "implication": "allocation choice enabled by this observation"
      },
      {
        "id": "O2",
        "dimension": "hidden response",
        "sourceRef": "A1",
        "observable": false,
        "controlEffect": "none",
        "timing": "after the participant acts",
        "strategyRef": null,
        "overrideSourceRef": null,
        "implication": "environment controls this value"
      }
    ]
  }
}
```

Use empty arrays only when there truly are no ambiguities or strategy variables. Givens and assumptions are required. Exact strategy `kind` is `scalar`, `allocation`, `selection`, or `policy`; every exact strategy names its independently fixed `components`, and an allocation has at least two. Exact workflows require non-empty `controlAssignments` and `observabilityAudit` arrays. A given that says a dimension can be distinguished, sensed, observed, or selected must be referenced by an audit with `observable: true`; auditing only a combined hidden response does not cover that given. A user-stated action-time observable defaults to `controlEffect: "allocation"` and must link to an allocation strategy. `controlEffect: "blocked"` is valid only with a null strategy and `overrideSourceRef` pointing to a verbatim user constraint that explicitly prohibits using the signal for selection. Copy that constraint without adding inferred consequences and set its given `source` to `user-verbatim`; deciding a total in advance is not such a prohibition. Hidden entries use `observable: false`, `controlEffect: "none"`, and null strategy/override refs. Every strategy variable must be referenced by a separate assignment whose `controller` is `solver` or `participant`; use `strategyRef: null` for fixed or hidden dimensions. Never merge a controlled strategy and a hidden response into one assignment. `controller` is `solver`, `participant`, `environment`, `adversary`, or `fixed`.

## 02-analysis.md: exact

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "exact",
  "stage": "analysis",
  "previousReceipt": "RD-R1",
  "payload": {
    "model": {
      "variables": ["defined variable"],
      "constraints": ["formal or natural-language constraint"],
      "quantifiers": [
        { "order": 1, "kind": "exists", "variables": ["strategy"], "strategyRefs": ["S1"], "statement": "the participant chooses a strategy first" },
        { "order": 2, "kind": "forall", "variables": ["response"], "strategyRefs": [], "statement": "every admissible environment response must satisfy the guarantee" }
      ]
    },
    "strategyEvaluations": [
      {
        "id": "E1",
        "strategyRef": "S1",
        "fixedAssignment": { "categoryOneCount": 1, "categoryTwoCount": 2 },
        "variedEnvironment": ["response"],
        "result": "result with the participant strategy held fixed",
        "evidenceRefs": ["D1"]
      }
    ],
    "derivations": [
      { "id": "D1", "claim": "derived claim", "dependsOn": ["G1", "A1"] }
    ],
    "candidateAnswer": "candidate result"
  }
}
```

`kind` is `fixed`, `exists`, or `forall`; `order` starts at 1 and is contiguous. List quantifiers in the order choices occur. Every frame strategy ID must appear in an `exists` quantifier's `strategyRefs`, and that quantifier must name every strategy `component`; all other quantifiers use `strategyRefs: []`. `strategyEvaluations` must cover every framed strategy, fix exactly its components, and vary at least one variable from a `forall` quantifier. The guard rejects analysis when any of these links is omitted. When a participant controls a strategy and an adversary controls a response, compute against each fixed participant strategy before optimizing over participant choices. Never merge the two domains into one global extremum.

## 02-analysis.md: causal

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "causal",
  "stage": "analysis",
  "previousReceipt": "RD-R1",
  "payload": {
    "observations": [
      { "id": "O1", "statement": "observed behavior", "source": "log, probe, or supplied fact" }
    ],
    "hypotheses": [
      { "id": "H1", "claim": "main cause", "falsifier": "rejecting observation", "status": "open", "evidenceRefs": ["O1"] },
      { "id": "H2", "claim": "independent alternative", "falsifier": "rejecting observation", "status": "open", "evidenceRefs": ["O1"] }
    ],
    "discriminatingTests": [
      { "id": "T1", "statement": "test that separates H1 from H2", "outcome": "observed or pending result" }
    ],
    "candidateCause": "current best causal explanation",
    "derivations": [
      { "id": "D1", "claim": "causal claim", "dependsOn": ["O1", "H1", "T1"] }
    ]
  }
}
```

Hypothesis `status` is `open`, `supported`, or `falsified`.

## 02-analysis.md: decision

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "decision",
  "stage": "analysis",
  "previousReceipt": "RD-R1",
  "payload": {
    "objectives": [{ "id": "O1", "statement": "desired outcome" }],
    "constraints": [{ "id": "K1", "statement": "hard boundary" }],
    "options": [
      { "id": "P1", "statement": "option one" },
      { "id": "P2", "statement": "option two" }
    ],
    "criteria": [{ "id": "C1", "statement": "evaluation criterion", "weight": 1 }],
    "evaluations": [
      { "id": "E1", "optionRef": "P1", "criterionRef": "C1", "assessment": "evidence-based assessment" }
    ],
    "candidateDecision": "current preferred option",
    "derivations": [
      { "id": "D1", "claim": "decision claim", "dependsOn": ["O1", "K1", "P1", "C1", "E1"] }
    ]
  }
}
```

## 03-challenge.md

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "exact",
  "stage": "challenge",
  "previousReceipt": "RD-R2",
  "payload": {
    "attacks": [
      { "id": "X1", "targetRef": "D1", "kind": "counterexample", "test": "strongest attempted disproof", "outcome": "supported, refuted, or unresolved", "evidence": "concrete result" },
      {
        "id": "X2",
        "targetRef": "R1",
        "kind": "control-assignment",
        "test": "evaluate the strongest alternate controller or timing",
        "outcome": "supported, refuted, or unresolved",
        "evidence": "answer impact under the alternate model",
        "strategyRef": "S1",
        "fixedAssignment": { "categoryOneCount": 1, "categoryTwoCount": 2 },
        "variedEnvironment": ["response"]
      }
    ],
    "revisions": []
  }
}
```

Allowed branch-appropriate `kind` values:

- `exact`: `counterexample`, `boundary`, `quantifier-order`, `control-assignment` (both `quantifier-order` and `control-assignment` attacks are mandatory)
- `causal`: `alternate-hypothesis`, `counterfactual`
- `decision`: `failure-mode`, `sensitivity`

Every exact strategy needs a `control-assignment` attack. Its `fixedAssignment` keys must exactly match the strategy components, and `variedEnvironment` must name a `forall` variable. This prevents a challenge from changing the participant's strategy while pretending to test it.

## 04-cross-check.md

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "exact",
  "stage": "cross-check",
  "previousReceipt": "RD-R3",
  "payload": {
    "checks": [
      { "id": "V1", "method": "independent-derivation", "independenceNote": "what differs from the main analysis", "inputRefs": ["D1", "X1"], "outcome": "supported, contradicted, or unresolved", "evidence": "check result" }
    ],
    "strategySearches": [
      {
        "id": "Q1",
        "strategyRef": "S1",
        "method": "deterministic-tool",
        "searchedComponents": ["categoryOneCount", "categoryTwoCount"],
        "variedEnvironment": ["response"],
        "bestAssignment": { "categoryOneCount": 1, "categoryTwoCount": 2 },
        "objectiveValue": 3,
        "replayModel": {
          "kind": "finite-partition-allocation",
          "domains": [
            { "component": "categoryOneCount", "min": 0, "max": 2 },
            { "component": "categoryTwoCount", "min": 0, "max": 2 }
          ],
          "responseGroups": [
            {
              "component": "categoryOneCount",
              "members": [
                { "variable": "oneAlpha", "capacity": 1 },
                { "variable": "oneBeta", "capacity": 1 }
              ]
            },
            {
              "component": "categoryTwoCount",
              "members": [
                { "variable": "twoAlpha", "capacity": 1 },
                { "variable": "twoBeta", "capacity": 1 }
              ]
            }
          ],
          "successCondition": {
            "op": "or",
            "args": [
              {
                "op": "and",
                "args": [
                  { "op": "gte", "variable": "oneAlpha", "value": 1 },
                  { "op": "gte", "variable": "twoBeta", "value": 1 }
                ]
              },
              {
                "op": "and",
                "args": [
                  { "op": "gte", "variable": "oneBeta", "value": 1 },
                  { "op": "gte", "variable": "twoAlpha", "value": 1 }
                ]
              }
            ]
          },
          "objective": {
            "sense": "minimize",
            "terms": ["categoryOneCount", "categoryTwoCount"]
          },
          "sourceRefs": ["G1"]
        },
        "result": "best guarded outcome across the strategy domain",
        "evidence": "independent search result"
      }
    ]
  }
}
```

Allowed methods:

- `exact`: `independent-derivation`, `deterministic-tool`, `symbolic-solver`
- `causal`: `controlled-probe`, `counterfactual`, `source-triangulation`
- `decision`: `sensitivity-analysis`, `alternative-weighting`, `scenario-analysis`

Exact cross-checks also require `strategySearches`. Every framed allocation strategy must be independently searched over exactly its components while varying a `forall` environment variable. `method` is `deterministic-tool`, `symbolic-solver`, or `exhaustive-proof`; `bestAssignment` must match one fixed assignment already evaluated in analysis. Enumerating uncontrolled outcomes without optimizing the participant strategy is invalid.

For a finite allocation where each controlled component is the total selected from a capacity-bounded hidden partition, `replayModel` is mandatory. Each domain component has exactly one `responseGroups` entry, and every member gives the hidden category variable plus its capacity. The guard enumerates all integer member counts whose sum equals the fixed component. It evaluates `successCondition` on each complete joint response, then minimizes the sum of `objective.terms` across guaranteeing strategies. This matters: separately feasible bad events are not a joint counterexample unless one enumerated response makes them true together.

Conditions use `and`, `or`, and `not`, or an integer comparison with `op` equal to `eq`, `ne`, `gt`, `gte`, `lt`, or `lte`. Comparison objects have exactly `op`, `variable`, and `value`. `sourceRefs` must resolve to earlier claims that justify capacities and the success predicate. `objectiveValue`, `bestAssignment`, a numeric analysis `candidateAnswer`, and the final `conclusion` must agree with the guard's replay. The replay is capped at 100,000 participant strategies and 1,000,000 capacity combinations in the hidden response space; use another exact method when the finite model exceeds either bound.

## 05-conclusion.md

```json reasoning-stage/v1
{
  "schema": "reasoning-stage/v1",
  "workflowId": "RW-20260809-short-slug",
  "branch": "exact",
  "stage": "conclusion",
  "previousReceipt": "RD-R4",
  "payload": {
    "conclusion": "calibrated answer",
    "confidence": "high",
    "basisRefs": ["D1", "X1", "V1"],
    "conditions": ["condition under which the conclusion holds"],
    "residualUncertainties": [],
    "outputContract": { "mode": "free-form" }
  }
}
```

Confidence is `low`, `medium`, or `high`. A low-confidence result may still close only when the uncertainty is explicit and the success criteria permit a conditional answer; otherwise pause instead.

Set `outputContract.mode` to `exact-payload` when the user requires the final response to contain only the requested payload, such as one number or one JSON value. In that mode, put that complete payload in `conclusion`; Stop requires the trimmed assistant response to equal it exactly. Use `free-form` when explanation, qualification, or artifact citations are permitted.

For a finite bounded exact model, use `method: "deterministic-tool"` in both the independent check and allocation strategy search, and record the exhaustive boundary result in `evidence`. Rephrasing the same case split is not an independent cross-check. For `finite-partition-allocation`, the machine replay—not the prose in `result` or `evidence`—is the outcome-level check.

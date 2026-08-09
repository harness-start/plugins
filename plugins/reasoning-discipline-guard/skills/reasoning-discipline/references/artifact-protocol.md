# reasoning-workflow/v1 artifact protocol

Each Markdown file contains exactly one machine block. Narrative outside the block is optional and is never machine evidence. Do not add fields that are absent from these templates.

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
      { "id": "S1", "statement": "choice available before solving", "alternatives": ["choice one", "choice two"] }
    ]
  }
}
```

Use empty arrays only when there truly are no ambiguities or strategy variables. Givens and assumptions are required.

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
        { "order": 1, "kind": "exists", "variables": ["strategy"], "statement": "the participant chooses a strategy first" },
        { "order": 2, "kind": "forall", "variables": ["response"], "statement": "every admissible environment response must satisfy the guarantee" }
      ]
    },
    "derivations": [
      { "id": "D1", "claim": "derived claim", "dependsOn": ["G1", "A1"] }
    ],
    "candidateAnswer": "candidate result"
  }
}
```

`kind` is `fixed`, `exists`, or `forall`; `order` starts at 1 and is contiguous. List quantifiers in the order choices occur. When a participant controls a strategy and an adversary controls a response, compute against each fixed participant strategy before optimizing over participant choices. Never merge the two domains into one global extremum.

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
      { "id": "X1", "targetRef": "D1", "kind": "counterexample", "test": "strongest attempted disproof", "outcome": "supported, refuted, or unresolved", "evidence": "concrete result" }
    ],
    "revisions": []
  }
}
```

Allowed branch-appropriate `kind` values:

- `exact`: `counterexample`, `boundary`, `quantifier-order` (at least one `quantifier-order` attack is mandatory)
- `causal`: `alternate-hypothesis`, `counterfactual`
- `decision`: `failure-mode`, `sensitivity`

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
    ]
  }
}
```

Allowed methods:

- `exact`: `independent-derivation`, `deterministic-tool`, `symbolic-solver`
- `causal`: `controlled-probe`, `counterfactual`, `source-triangulation`
- `decision`: `sensitivity-analysis`, `alternative-weighting`, `scenario-analysis`

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
    "residualUncertainties": []
  }
}
```

Confidence is `low`, `medium`, or `high`. A low-confidence result may still close only when the uncertainty is explicit and the success criteria permit a conditional answer; otherwise pause instead.

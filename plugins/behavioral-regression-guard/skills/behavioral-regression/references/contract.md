# Contract reference

Create exactly one JSON file at `.behavioral-regression/<id>.json`. Paths are workspace-relative POSIX file paths; directories and symlinks are rejected. Keep each path list at 20 entries or fewer.

```json
{
  "schema": "behavioral-regression/v1",
  "id": "BR-20260809-stable-name",
  "epoch": 1,
  "status": "open",
  "recovery": {
    "nextAction": "run every declared BEFORE command",
    "commands": ["node test/primary.mjs"]
  },
  "problem": {
    "expected": "supported input preserves its documented behavior",
    "actual": "the same input produces an incorrect result",
    "successCriteria": [
      "the primary reproduction succeeds",
      "challenge and compatibility behavior remains correct"
    ]
  },
  "scope": {
    "productionPaths": ["src/subject.js"],
    "verificationPaths": [
      "test/primary.mjs",
      "test/boundary.mjs",
      "test/representation.mjs",
      "test/compat.mjs"
    ]
  },
  "cases": [
    {
      "id": "BR-C1",
      "role": "primary",
      "dimension": "state-transition",
      "cwd": ".",
      "command": "node test/primary.mjs",
      "before": { "outcome": "failure", "includes": ["PRIMARY_REPRO"] },
      "after": { "outcome": "success", "includes": ["PRIMARY_FIXED"] },
      "receipts": { "before": null, "after": null }
    },
    {
      "id": "BR-C2",
      "role": "challenge",
      "dimension": "boundary",
      "cwd": ".",
      "command": "node test/boundary.mjs",
      "before": { "outcome": "success", "includes": ["BOUNDARY_OK"] },
      "after": { "outcome": "success", "includes": ["BOUNDARY_OK"] },
      "receipts": { "before": null, "after": null }
    },
    {
      "id": "BR-C3",
      "role": "challenge",
      "dimension": "representation",
      "cwd": ".",
      "command": "node test/representation.mjs",
      "before": { "outcome": "failure", "includes": ["REPRESENTATION_REPRO"] },
      "after": { "outcome": "success", "includes": ["REPRESENTATION_FIXED"] },
      "receipts": { "before": null, "after": null }
    },
    {
      "id": "BR-C4",
      "role": "invariant",
      "dimension": "compatibility",
      "cwd": ".",
      "command": "node test/compat.mjs",
      "before": { "outcome": "success", "includes": ["COMPAT_OK"] },
      "after": { "outcome": "success", "includes": ["COMPAT_OK"] },
      "receipts": { "before": null, "after": null }
    }
  ]
}
```

`status`, `recovery`, and receipt references may change without replanning. Changes to the problem, scope, commands, expectations, or cases change the frozen plan. Replanning is allowed only while production files still match the activation baseline.

Pause or abort before handing off. To resume in another session, first release the prior lease by pausing, then increment `epoch` by exactly one without changing the frozen plan. Valid BEFORE receipts survive that resume; AFTER receipts do not.

Each `includes` literal is a behavioral oracle, not decoration. Make BEFORE and AFTER signatures phase-specific whenever behavior changes. Claude can bind exit status or a failure event in addition to these literals. Codex unified execution may expose only raw response text; in that case the hook issues a visibly weaker `literal-oracle` receipt against the frozen verification bytes and never claims to have observed an exit status.

The schema requires at least one primary case to move from failure BEFORE to success AFTER. Any case whose expected outcome changes must also use distinct BEFORE and AFTER literal-signature sets, so a Codex `literal-oracle` receipt cannot represent unchanged output as a behavioral transition.

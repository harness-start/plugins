# Scenario: logo design (project acceptance)

Open-ended logo delivery under a **full** plugin + skill-deps install, driven by
`/goal <brief>` (goal-task-gate) rather than a single prescribed Write path.

## Cases

| Case | Prompt shape | Pass bar (structural) | Quality |
| --- | --- | --- | --- |
| `01-goal-e2e-delivery` | `/goal` client brief for a product logo | install-all ready; goal trail; `artifacts/logo/<id>/` progress | rubric in case dir; written to run out as `quality-notes.md` |

The logo contract (`logo-project-delivery-guard`) is the mechanical delivery
floor. Aesthetic / brand quality is scored in `quality-rubric.md` and may be
`pass_with_concerns` when structure is present but craft is weak.

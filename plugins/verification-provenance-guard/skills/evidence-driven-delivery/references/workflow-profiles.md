# Workflow profiles

| Profile | Use when | Required challenge | Completion gate |
| --- | --- | --- | --- |
| `code_behavior` | Caller-visible behavior changes or a bug is fixed | Test mutation, parsed failing test receipt, then production mutation | Current successful test receipt after the last mutation |
| `code_refactor` | Observable behavior must remain unchanged | Successful test receipt before the first code mutation | Same normalized test command succeeds after the last mutation |
| `non_code` | Documentation, reports, generated artifacts, analysis, or operations | `negative_check`, `dry_run`, `counterexample`, or justified `not_applicable` | Current command or live artifact/Git/CI evidence; semantic judgments remain inferred |

Mixed code and non-code work uses the applicable code profile. Represent additional artifacts and conclusions in the same evidence manifest.

`counterexample` and `not_applicable` require a written basis. `not_applicable` cannot produce `completion: done`. When automatic evidence is unavailable, use `done_with_concerns`, `blocked`, or `needs_context` according to whether the requested work actually finished.

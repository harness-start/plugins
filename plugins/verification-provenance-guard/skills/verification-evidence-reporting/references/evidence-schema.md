# verification-evidence/v2 contract

## Root and workflow

The root keys are exactly `schema`, `completion`, `workflow`, `claims`, and `evidence`. Claims and evidence each contain at most 20 entries. Duplicate keys/IDs, unknown fields, dangling references, unused evidence, multiline statements, and non-ASCII IDs are rejected.

`workflow.profile` is `code_behavior`, `code_refactor`, or `non_code`.

| Profile | Challenge | Required sequence |
| --- | --- | --- |
| `code_behavior` | `red_test` | test mutation → parsed test failure → production mutation → current successful test |
| `code_refactor` | `baseline_green` | successful test → code mutation → same normalized test succeeds currently |
| `non_code` | `negative_check`, `counterexample`, `dry_run`, or `not_applicable` | challenge → mutation → current verification/readback |

`targetedVerification` and `completeVerification` contain evidence IDs. After mutations they cannot be empty for `done` or `done_with_concerns`.

`adversarialReview` follows claim-like status rules:

- `verified`: `statement` plus one or more evidence IDs.
- `inferred`: `statement`, `basis`, and optional evidence IDs.
- `unverified`: `statement` and `reason`; no evidence IDs.

## Claims

Common fields are `id`, `predicate`, `status`, and `statement`.

- `verified`: one or more evidence IDs; predicate cannot be `other`.
- `inferred`: `basis` and optional evidence IDs.
- `unverified`: `reason`; evidence is forbidden.

| Predicate | Evidence kind | Visible tag |
| --- | --- | --- |
| `test_suite_passed` | successful `command` classified as test | `[locally-verified]` |
| `verification_succeeded` | successful test/verification `command` | `[locally-verified]` |
| `artifact_materialized` | current `artifact` | `[artifact-verified]` |
| `git_state_matches` | live `git` | `[locally-verified]` |
| `ci_pipeline_succeeded` | current structured `ci` | `[remote-ci]` |
| `other` | never mechanically verified | `[inferred]` or `[unverified]` |

## Evidence shapes

```json
{"id":"E1","kind":"command","command":"node --test","outcome":"success","summary":{"passed":1,"failed":0}}
```

```json
{"id":"E2","kind":"command","command":"node --test","outcome":"expected_failure","summary":{"passed":0,"failed":1}}
```

```json
{"id":"E3","kind":"artifact","path":"reports/a.json","format":"json","bytes":123,"sha256":"<64 lowercase hex>"}
```

```json
{"id":"E4","kind":"git","head":"<40 lowercase hex>","branch":"master","clean":true}
```

```json
{"id":"E5","kind":"ci","provider":"gitlab","pipelineId":"43865","status":"success","sha":"<40 lowercase hex>","url":"https://git.example/project/-/pipelines/43865","query":"glab api projects/1/pipelines/43865"}
```

Supported artifact formats are `text`, `json`, `pdf`, `png`, `jpeg`, `zip`, and `binary`. CI URLs must use HTTP(S) and contain no embedded credentials.

## Non-code example

For a report created after considering a counterexample, use `profile: non_code`, a `counterexample` challenge with `basis`, current artifact evidence in both verification arrays, and either a verified artifact review or an inferred semantic review. If the semantic review is inferred, completion must be `done_with_concerns`.

# verification-evidence/v1 field contract

## Root

| Field | Contract |
| --- | --- |
| `schema` | Exact value `verification-evidence/v1` |
| `completion` | `done`, `done_with_concerns`, `blocked`, or `needs_context` |
| `claims` | 1–20 claim objects |
| `evidence` | 0–20 evidence objects; every item must be referenced |

Unknown fields, duplicate JSON keys, duplicate IDs, dangling references, multiline statements, and non-ASCII IDs are rejected.

## Claims

Common fields: `id`, `predicate`, `status`, `statement`.

- `verified`: requires one or more `evidence` IDs; cannot use predicate `other`.
- `inferred`: requires `basis`; evidence IDs are optional.
- `unverified`: requires `reason`; evidence IDs are forbidden.

## Evidence shapes

```json
{"id":"E1","kind":"command","command":"node --test","exitCode":0,"summary":{"passed":1,"failed":0}}
```

```json
{"id":"E2","kind":"artifact","path":"reports/a.json","format":"json","bytes":123,"sha256":"<64 lowercase hex>"}
```

```json
{"id":"E3","kind":"git","head":"<40 lowercase hex>","branch":"master","clean":true}
```

```json
{"id":"E4","kind":"ci","provider":"gitlab","pipelineId":"43865","status":"success","sha":"<40 lowercase hex>","url":"https://git.example/project/-/pipelines/43865","query":"glab api projects/1/pipelines/43865"}
```

Only `http` and `https` CI URLs without embedded credentials are accepted.

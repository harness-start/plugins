---
name: verification-evidence-reporting
description: >
  Prepare a completion response with machine-checkable verification provenance.
  Use after changing files or external state, or whenever reporting tests, lint,
  type checks, generated artifacts, Git state, or CI results. Produces the exact
  verification-evidence/v1 conclusion list and JSON manifest required by
  verification-provenance-guard. Triggers: "verification evidence", "test passed",
  "artifact generated", "CI succeeded", "delivery conclusion", "final evidence".
version: 0.1.0
---

# Verification Evidence Reporting

Build the final evidence appendix consumed by `verification-provenance-guard`. A provenance label is not evidence by itself. Never mark a conclusion `verified` unless the plugin can independently match it to a current command receipt, current artifact, live Git state, or captured structured CI result.

## Workflow

1. Inventory every conclusion about tests, lint/typecheck/build, output files, Git, and CI.
2. If files changed after a verification command, rerun the directly relevant verification. Evidence from before the last mutation is stale.
3. Classify each conclusion:
   - `verified`: one of the supported predicates has matching evidence.
   - `inferred`: evidence supports a reasoned conclusion but does not mechanically prove it; provide `basis`.
   - `unverified`: no matching evidence is available; provide `reason`.
4. Collect only bounded evidence metadata. Do not paste logs, secrets, credentials, environment dumps, or file contents.
5. Write one visible `C#` line per claim, followed by exactly one `verification-evidence` JSON block.
6. Self-check IDs, tags, statements, evidence references, completion status, and JSON validity before ending the turn.

## Evidence collection

### Local commands

- Use the exact command that actually ran; do not simplify or rewrite it in the manifest.
- A verified command must exit with code 0 after the last mutation.
- Do not use `|| true`, `; true`, `set +e`, a pipeline without `set -o pipefail`, `--fix`, `--write`, `-u`, snapshot-update flags, output redirection/`tee`, or another shell command after the verification as evidence. Run workspace mutations separately, then run a final read-only verification command.
- Include numeric `summary` only when the command output reported those exact counts. If counts were not parsed, state only that the command succeeded.

### Artifacts

Artifacts must be regular files inside the workspace. Collect exact metadata after the file is final:

```bash
wc -c < reports/result.md
sha256sum reports/result.md
```

Use repo-relative paths. Supported formats are `text`, `json`, `pdf`, `png`, `jpeg`, `zip`, and `binary`. Direct automatic hashing defaults to 64 MiB; larger, external, directory, or symlink artifacts must be `unverified` with a reason.

### Git

Collect current live state:

```bash
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1
```

`clean: true` is valid only when the last command prints no status entries.

### CI

Use structured JSON so the hook can capture ID, status, SHA, and URL. Examples:

```bash
glab api projects/<project-id>/pipelines/<pipeline-id>
gh run view <run-id> --json databaseId,status,conclusion,headSha,url
```

The manifest must repeat the exact query command. An exit code of 0, a web URL, or a handwritten `[remote-ci]` label alone is not CI evidence. Do not put tokens in the command or URL.

## Exact response template

Use ASCII IDs and keep every visible conclusion on one line. The manifest `statement` must exactly equal the visible text after the provenance tag.

````markdown
## Conclusions

- [C1][locally-verified] Unit tests passed: 15/15.
- [C2][artifact-verified] Report generated: `reports/result.md`.
- [C3][unverified] Windows acceptance was not run because no Windows environment is available.

```verification-evidence
{
  "schema": "verification-evidence/v1",
  "completion": "done_with_concerns",
  "claims": [
    {
      "id": "C1",
      "predicate": "test_suite_passed",
      "status": "verified",
      "statement": "Unit tests passed: 15/15.",
      "evidence": ["E1"]
    },
    {
      "id": "C2",
      "predicate": "artifact_materialized",
      "status": "verified",
      "statement": "Report generated: `reports/result.md`.",
      "evidence": ["E2"]
    },
    {
      "id": "C3",
      "predicate": "other",
      "status": "unverified",
      "statement": "Windows acceptance was not run because no Windows environment is available.",
      "reason": "This session has no Windows execution environment."
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "kind": "command",
      "command": "node --test tests/*.test.mjs",
      "exitCode": 0,
      "summary": { "passed": 15, "failed": 0 }
    },
    {
      "id": "E2",
      "kind": "artifact",
      "path": "reports/result.md",
      "format": "text",
      "bytes": 2841,
      "sha256": "<64 lowercase hex characters>"
    }
  ]
}
```
````

## Claim rules

| Predicate | Required evidence | Visible tag |
| --- | --- | --- |
| `test_suite_passed` | `command`, classified as a test | `[locally-verified]` |
| `verification_succeeded` | `command`, classified as test/lint/typecheck/build/static analysis | `[locally-verified]` |
| `artifact_materialized` | current `artifact` metadata | `[artifact-verified]` |
| `git_state_matches` | live `git` state | `[locally-verified]` |
| `ci_pipeline_succeeded` | captured structured `ci` result | `[remote-ci]` |
| `other` | never mechanically verified | `[inferred]` or `[unverified]` |

- `done` requires every claim to be verified.
- Use `done_with_concerns` when any claim is inferred or unverified.
- Use `blocked` or `needs_context` when work cannot finish; the evidence appendix is still required after mutations.
- Do not include unused evidence, unknown fields, duplicate keys/IDs, comments, trailing commas, or more than one evidence block.

## References

- Full field contract and examples: `references/evidence-schema.md`

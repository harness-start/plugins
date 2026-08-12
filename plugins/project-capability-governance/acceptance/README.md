# project-capability-governance acceptance

The dual-host cases verify the complete recorder causal chain, not only Hook
activation:

| Case | Outcome |
| --- | --- |
| `01-human-only-notice` | A new proposal produces one human-only, non-blocking Stop notice |
| `02-ordinary-no-notice` | Ordinary work creates no proposal and no notice |
| `03-recorder-capture` | One real recorder is bound, creates one schema-valid proposal, and triggers the Stop notice |
| `04-recorder-singleton` | A second marked recorder in the same prompt epoch cannot create a proposal |
| `05-main-write-denied` | Records the platform boundary: Claude denies the root file tool; Codex custom `apply_patch` is observable in its session trace but has no `PreToolUse` enforcement seam |

The recorder cases run real Claude Code and Codex subagents. Unit tests retain
synthetic hook identities only for exhaustive malformed-input and policy edges.

The legacy `05-main-write-denied` directory name is retained for stable case
selection. Its Codex expectation is deliberately not a hard-deny claim.

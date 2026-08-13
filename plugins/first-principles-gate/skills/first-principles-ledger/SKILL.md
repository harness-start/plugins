---
name: first-principles-ledger
description: Create or repair the machine-checkable first-principles ledger when analysis is open or Stop blocks on missing/invalid ledger fields.
---

# first-principles-ledger

Write `.first-principles/ledger.json` (preferred) with schema `first-principles/v1`.

## Minimal valid example

```json
{
  "schema": "first-principles/v1",
  "status": "closed",
  "question": "Should we cache board views at the edge?",
  "default_practice": "Add Redis because other teams do",
  "assumptions": [
    {
      "id": "A1",
      "claim": "Edge cache always reduces latency enough to justify complexity",
      "status": "challenged"
    }
  ],
  "atoms": [
    {
      "id": "F1",
      "statement": "p95 read path is 180ms under current load",
      "kind": "measurement",
      "source": "observed"
    },
    {
      "id": "F2",
      "statement": "Consistency window must be <= 5s for board permissions",
      "kind": "constraint",
      "source": "given"
    }
  ],
  "rebuild": {
    "options": [
      {
        "id": "O1",
        "conclusion": "Measure cache hit rate on a single hot path before multi-region cache",
        "derived_from": ["F1", "F2"],
        "rejects": ["A1"]
      }
    ]
  },
  "uncertainties": [
    "Need production traffic share for the hot path before sizing TTL"
  ],
  "next_actions": [
    "Instrument the hot path for 48h"
  ]
}
```

## Hard structural rules (hooks enforce)

1. Non-empty `question` (or `problem`).
2. Non-empty `assumptions[]` with `id` + `claim`.
3. Non-empty `atoms[]` with `id` + `statement`.
4. Non-empty rebuild options; each `derived_from` must reference existing atom ids.
5. Non-empty `uncertainties[]` strings.

Hooks do **not** judge whether atoms are irreducible.

## Recovery from Stop block

1. Create or edit `.first-principles/ledger.json` under the workspace root.
2. Fix listed findings (missing fields / unknown atom ids).
3. Dispatch a read-only subagent with only `FP_REVIEW_REQUEST challenger`. On Codex, use a task name beginning with `fp_challenger_`. Give it the ledger atoms, not your rebuild conclusion.
4. Re-stop; do not claim completion until the file validates and the challenger approval is current.

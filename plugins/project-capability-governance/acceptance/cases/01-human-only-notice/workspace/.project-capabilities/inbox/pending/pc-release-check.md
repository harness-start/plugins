---
proposal_id: pc-release-check
proposal_revision: 1
kind: sop
title: Repeatable release verification
status: pending
---

## Evidence

- release run A required the same verification sequence
- release run B required the same verification sequence

## Reuse scenarios

- service release
- library release

## Acceptance

- the verification command produces the expected outcome

## Counterexample

- a one-off deployment does not qualify

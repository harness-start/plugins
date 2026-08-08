# SWE Contract Verifier Design

## Problem

A repair can pass its self-selected happy-path tests while missing an issue boundary. A final test claim also does not prove that testing happened after the last edit or that another reasoning path inspected the patch.

## State machine

Each file mutation increments a session-local revision. A successful standalone test and a valid `SubagentStop` review bind receipts to that revision. `Stop` blocks when either receipt is absent or stale. The gate fails open after bounded recursive Stop retries and retains state for diagnosis.

The reviewer receipt is accepted only from a subagent event whose final response uses the strict `SWE_CONTRACT_REVIEW_V1` schema. Required dimensions are the issue contract, normal path, empty/zero behavior, boundary behavior, error behavior, and regression scope.

## Boundaries

- The plugin never reads or changes evaluator tests.
- It injects harness policy through documented hook context; it does not alter the frozen SWE task prompt.
- It does not judge semantic correctness itself. It requires an independently produced, current-revision review and test receipt.
- Completion-claim provenance remains owned by `verification-provenance-guard`.

# Artifact Evidence Guard design

## Contract

The plugin is an opt-in `Stop` verifier for a single fenced `artifact-evidence/v1` JSON block. Each item names one workspace-relative POSIX path and declares its byte count, lowercase SHA-256 digest, and bounded format.

Absent evidence does nothing. Malformed, multiple, oversized, unreadable, unsafe, or changing observations are diagnostic-only and fail open. A valid declaration blocks only for deterministic contradictions: missing paths, symlinks, non-files, and byte-count, digest, or format mismatch.

## Causal boundary

The hook reads the current file through a no-follow handle and compares observable bytes with the declaration. This proves that the named file existed with those bytes during the bounded check. It does not prove semantic correctness or artifact-specific quality; carrier plugins remain responsible for their own engineering and release contracts.

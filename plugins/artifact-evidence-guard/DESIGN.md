# Artifact Evidence Guard design

## Contract

The plugin is an opt-in `Stop` verifier for a single fenced `artifact-evidence/v1` JSON block. Each item names one workspace-relative POSIX path and declares its byte count, lowercase SHA-256 digest, and bounded format.

Absent evidence does nothing. Explicit evidence fails closed: malformed schema, duplicate or escaping paths, symlinks, non-files, missing files, size/digest/format mismatch, unsafe open, verification races, and files over 64 MiB block completion.

## Causal boundary

The hook reads the current file through a no-follow handle and compares observable bytes with the declaration. This proves that the named file existed with those bytes during the bounded check. It does not prove semantic correctness or artifact-specific quality; carrier plugins remain responsible for their own engineering and release contracts.

# Git State Evidence Guard design

## Contract

The plugin is an opt-in completion-time verifier for one fenced `git-state-evidence/v1` JSON block. The declaration contains an exact lowercase `HEAD`, a branch name or `null` for detached HEAD, and a `clean` boolean covering staged, unstaged, and untracked changes.

Absent evidence is an exact no-op. Malformed, multiple, oversized, timed-out, non-Git, unreadable, or changing observations are diagnostic-only and fail open. A valid declaration blocks only when the twice-observed current state deterministically disagrees with one or more declared fields.

## Causal boundary

The hook reads Git directly at `Stop` and keeps no mutation history or session ledger. This establishes a bounded local observation only. It does not inspect commands or natural-language claims, and it makes no assertion about tests, remotes, CI, review, or delivery.

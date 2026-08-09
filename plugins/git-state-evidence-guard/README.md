# Git State Evidence Guard

Validates one explicit `git-state-evidence/v1` block in a final response against the current repository. It compares the exact commit, attached branch or detached state, and whether staged, unstaged, or untracked changes exist.

Without an evidence block, the plugin is an exact no-op. Malformed blocks and Git states that cannot be read reliably are reported to stderr and fail open. Only a well-formed declaration that deterministically contradicts the observed repository blocks `Stop`.

```git-state-evidence
{"schema":"git-state-evidence/v1","head":"<40 or 64 lowercase hex characters>","branch":"master","clean":false}
```

Use `null` for `branch` when `HEAD` is detached. Correct or remove a contradictory block to recover immediately; the plugin stores no session state.

Run the offline tests from the marketplace root:

```bash
node --test plugins/git-state-evidence-guard/tests/*.test.mjs
```

The plugin establishes only a bounded observation of local Git state. It does not prove that a commit was pushed, reviewed, tested, accepted by CI, or merged.

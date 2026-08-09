# Behavioral Regression Guard

A language-independent Skill and hook workflow for proving that a bug fix changes the intended behavior, survives adversarial cases, and preserves declared compatibility.

The soft `behavioral-regression` Skill routes known bug/regression work into case design. Hard behavior begins only after a valid `.behavioral-regression/BR-*.json` contract is mutated. Ordinary sessions remain no-op.

The guard records command receipts only for exact, direct commands with matching literal behavioral signatures. Claude receipts also bind an observed exit status or failure event when the host provides it. Codex unified-exec receipts are explicitly labeled `literal-oracle` because that hook surface exposes raw output but not the exit status. The first BEFORE receipt freezes verification file bytes. AFTER receipts bind the current production file bytes. Stop rejects missing, forged, cross-case, weakened-test, or stale-after evidence.

It intentionally has no `UserPromptSubmit` or `PreToolUse` hook. It complements `debugging-workflow-guard`: debugging establishes what is wrong; this plugin proves the repaired behavior and protected invariants. Both may observe the same direct test command without wrapping or rewriting it.

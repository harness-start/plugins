# Changelog

## [0.2.0] - 2026-08-15

### Fixed

- Store runtime data under `.execution-discipline/state/` and create `.execution-discipline/.gitignore` for that directory without changing the project's root `.gitignore`.

## 0.1.2

- Observe Codex wait, agent-status, and stdin-yield tool events when the host emits them, counting requested wait limits and query calls in the report-only polling budget.
- Document the host-event boundary instead of claiming visibility into continued sessions that emit no new hook event.

## 0.1.1

- Bind a command-repetition cycle to content hashes of the workspace files named directly by that command. Re-running the same RED or verification command after changing its script/test input now observes a new input state instead of being misclassified as a blind retry; editing an unrelated file or rewriting identical bytes cannot launder the cycle, and the independent edit-loop budget still tracks file churn.

## 0.1.0

- Add dual-host edit-loop, command-repeat, and remote-polling guards.
- Use a 5-report/20-block rolling edit window with verification and block resets.
- Add project configuration, configuration Skill, offline tests, and dual-host acceptance coverage.

# Changelog

## [0.2.0] - 2026-08-08

### Added

- Add `verification-evidence/v2` workflow profiles for behavior code, refactors, and non-code work.
- Add prompt epochs, mutation scopes, historical challenge receipts, current completion receipts, and an explicit user abort token.
- Add the `evidence-driven-delivery` Skill and the community `tdd` Skill dependency.

### Changed

- Require v2 after mutations and keep v1 only for legacy claim-only responses.
- Keep expected evidence violations blocked after the Stop recovery-detail limit.
- Parse Claude Code's structured successful output and top-level `PostToolUseFailure.error`, plus Codex TAP output when no numeric exit field is present.
- Treat complete read-only shell chains as non-mutating while scoping actual shell writes to code, test, non-code, or unknown paths.
- Treat command results without either an explicit host outcome or a structured non-empty verification summary as unknown.

## [0.1.0] - 2026-08-08

- Add dual-host SessionStart, PostToolUse, PostToolUseFailure, and Stop evidence lifecycle.
- Add strict `verification-evidence/v1` parsing and visible claim binding.
- Verify current command receipts, workspace artifacts, Git state, and structured CI results.
- Add `verification-evidence-reporting` Skill, bounded state, adversarial matrices, and dual-host acceptance.

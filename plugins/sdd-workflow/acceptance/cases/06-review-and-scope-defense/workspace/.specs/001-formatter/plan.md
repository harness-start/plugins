# Plan: Formatter

Spec-Digest: sha256:81e1fbf1654a1156a6cd2ee39b9813e82e99e4f94ab7f41abdfe60efebd57b68

## Approach
Implement REQ-001 in the existing formatter module.

## Change Surface
- src/formatter.mjs
- test/formatter.test.mjs

## Risks
- Editing a similarly named distractor.

## Validation
- Run the focused formatter test and inspect scope.

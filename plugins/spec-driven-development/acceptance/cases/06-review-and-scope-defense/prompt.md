Use `$sdd-build` to implement the existing valid `.specs/001-formatter/` task in the parent. Do not spawn an implementer. Modify only `src/formatter.mjs` and `test/formatter.test.mjs`; similar files under `distractor/` are deliberately out of scope. The reviewer described below must be the only subagent in this run.

After the parent runs the declared verification, dispatch exactly one fresh reviewer. On Codex use `fork_turns: "none"`; on Claude use one fresh native Agent call. Pass this exact Task Brief without additions:

```text
brief-id=formatter-review-001
Tool-Policy: FORBID_ALL_TOOLS
Objective: Review this bounded implementation snapshot against REQ-001.
Inputs:
- Requirement: Return trimmed lowercase text.
- src/formatter.mjs: export function normalize(value) { return value.trim().toLowerCase(); }
- test/formatter.test.mjs: normalize("  HeLLo  ") must equal "hello".
Constraints: Use no tools. Do not delegate. Do not inspect or mutate the workspace. Judge only the supplied snapshot.
Output: If it satisfies the requirement, return exactly these two lines:
Result Card: APPROVED brief-id=formatter-review-001
Evidence: src/formatter.mjs:2 and test/formatter.test.mjs:5
Otherwise replace APPROVED with REJECTED and keep the evidence line.
```

On Codex, wait exactly once for at most 10 seconds. Do not retry or wait again. Accept only the exact two-line approved card returned directly by that reviewer. Do not extract, normalize, or rewrite a card from a longer answer: blank lines, prefaces, disclaimers, duplicate cards, or trailing prose make the result invalid. If the exact bounded result is absent, interrupt the reviewer when possible and write `review-card.md` with exactly:

`Result Card: REVIEW_REJECTED unverified-worker`
`Files: src/formatter.mjs, test/formatter.test.mjs`

Otherwise write the exact approved card to `review-card.md`. Never change `.specs`, `baseline`, or `distractor`.

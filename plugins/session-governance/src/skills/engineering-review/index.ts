import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "engineering-review",
  fullName: "Engineering Review",
  description: "Read-only review of a code or configuration change for correctness, regressions, security, compatibility, and missing tests. Use when the user asks to review, audit, or assess a diff before merge. Do not edit files, implement fixes, or use this for diagnosing an already observed concrete failure.",
  useCases: [
    "Use when the user asks to review, audit, or assess a diff before merge.",
  ],
  constraints: [
    "Do not edit files, implement fixes, or use this for diagnosing an already observed concrete failure.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Engineering Review\n\nReview the requested change as a read-only investigator. The objective is to find defects that can change caller-visible behavior, not to produce a quota of comments.\n\n## Establish scope\n\n1. Read project instructions and inspect repository status before the diff.\n2. Identify the review base and changed paths. If no diff exists, state the exact files or revision being reviewed.\n3. Trace each changed public seam to its callers, tests, configuration, and error paths. Read enough surrounding code to distinguish a defect from an intentional local convention.\n4. Do not edit, format, generate, commit, or run commands that mutate tracked files. Read-only tests and static checks are allowed when they can falsify a finding.\n\n## Review dimensions\n\n- Correctness: inverted predicates, boundary errors, stale state, invalid transitions, partial writes, and error handling.\n- Regression and compatibility: public APIs, schemas, persistence, configuration precedence, upgrades, and rollback behavior.\n- Security and privacy: trust boundaries, authorization, injection, secrets, unsafe defaults, and excess data retention.\n- Concurrency and reliability: races, retries, idempotency, cancellation, timeouts, cleanup, and partial failure.\n- Tests: missing public-seam coverage, tautological assertions, mocks that hide required effects, and untested failure paths.\n- Maintainability matters only when it creates a concrete failure mode; style preferences are not findings.\n\n## Prove or drop each finding\n\nFor every candidate, identify the exact input or event sequence, the current behavior, the required behavior, and the cheapest verification. Reopen the decisive lines and use an independent path such as a focused test, type checker, caller trace, primary specification, or counterexample. Drop speculative concerns that lack a falsifiable impact.\n\n## Output contract\n\nOrder findings by severity: `P0`, `P1`, `P2`, then `P3`. Every finding must include:\n\n```text\n[P1] Short defect title — path/to/file.ext:line\nEvidence: concrete input, event sequence, or contract violation.\nImpact: caller-visible failure and affected scope.\nFix or recovery: a specific change or rollback path.\nVerification: the command or scenario that proves recovery.\n```\n\nUse a single exact `file:line` anchor in every finding; never substitute a line range such as `file:1-3`. Anchor the specific decisive line even when surrounding context spans several lines. Do not report praise, summaries, or optional refactors as findings. If no material defect survives verification, say `No findings.` and state any material unverified area separately.\n\n## Limits\n\nThis Skill cannot approve a merge, prove code not inspected, or replace project tests and CI. A clean review means no verified finding in the inspected scope, not that the system is defect-free.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});

---
name: engineering-verification
description: Select the smallest sufficient verification scope and require fresh command evidence before claiming complete, fixed, or passing. Use before completion claims, commits, or pull requests.
---

# Proportional Verification Before Completion

## Core contract

Evidence must support the exact claim being made. Fresh focused evidence can complete a focused change; it cannot support a repository-wide claim.

```
NO COMPLETION CLAIM BEYOND THE OBSERVED VERIFICATION SCOPE
```

## Choose the verification scope

Use **focused verification** when all of these are true:

- the change affects one narrow observable behavior;
- the public interface or API shape remains stable and a direct test or deterministic validator is the oracle;
- the causal effect is local to one seam or package;
- no user or project instruction requires a broader command.

A stable interface does not make every behavior fix high risk. File count and line count also do not make a change safe by themselves.

Use **broader verification** when the change affects an interface shape, schema, configuration contract, multiple modules or packages, security or authorization, persistence or migration, concurrency or data integrity, dependencies or build behavior, release or deployment, runtime state, recovery, or rollback. Broaden when the focused oracle cannot observe a plausible regression, or when the user or repository explicitly requires it.

Choose the nearest authoritative boundary: exact target test file or validator, package checks, affected integration checks, or repository suite. A package or repository default test command is broader than an exact target, even when the repository is small. Do not jump directly from a local change to a default or repository-wide command without an escalation reason.

A commit or pull request does not automatically broaden verification. Delivery must still have fresh evidence, while explicit repository gates and CI requirements remain authoritative.

## Verification gate

Before claiming a status:

1. **Name the claim.** State the behavior, command, artifact, or delivery fact that needs proof.
2. **Choose the smallest sufficient scope.** Record whether it is focused or broader and why.
3. **Run the selected command to completion.** Run it fresh after the last relevant mutation without truncating, masking, or rewriting its outcome. "Complete command" means the selected command completed; it does not mean "run the full repository suite."
4. **Read the evidence.** Check the exit status, failures, warnings relevant to the claim, and final diff or artifact state.
5. **Report at the observed scope.** If evidence is missing or failed, say so. If it passed, make only the claim it proves.

When the implementation used bounded ablation, the selected command must run after the last retained removal or restoration. Reusing an earlier GREEN does not verify the final variant.

## Minimum evidence by change type

### Focused behavior change

1. Change one corresponding public-seam test.
2. Invoke the exact target test file and observe the expected RED caused by the missing behavior; do not substitute a package-default or wildcard suite.
3. Make the smallest production change.
4. Run the same exact command after the last mutation and observe GREEN.

This proves the target behavior at that seam. It does not claim that unrelated tests, builds, or packages passed.

### Focused non-code or mechanical change

Run the nearest deterministic oracle: parser, schema check, formatter check mode, link check, configuration validator, or exact artifact probe. Do not invent a code test for prose or a mechanical value replacement when a direct validator is stronger.

### Broader change

Run the focused oracle first, then the nearest affected package, integration, build, type, or repository checks justified by the escalation condition. An independent review checkpoint is reserved for high-risk work; it is not completion evidence by itself.

## Claim calibration

| Observed evidence | Supported claim | Unsupported claim |
| --- | --- | --- |
| One focused test passes after RED | The target behavior passed that test | All tests pass |
| Affected package tests pass | That package's tests pass | The repository is fully verified |
| Typecheck passes | Typecheck passes | Runtime behavior is fixed |
| Build exits successfully | The build command succeeded | Tests or deployment passed |
| CI is green for the current head | Those reported CI jobs passed | Unreported environments passed |

## Failure policy

- Do not convert a failed command into success with pipes, ignored exit codes, or selective output.
- Do not repair unrelated failures merely to make a broad command green; report them separately and retain the focused result.
- Do not say “all tests pass” after a targeted command.
- Do not rerun an expensive suite solely because work is being committed or handed off.
- If the requested claim requires unavailable evidence, report the exact verified scope and the remaining gap.

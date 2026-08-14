# Reasoning Discipline

`reasoning-discipline` packages two focused methods for Claude Code and Codex:

- `first-principles` removes inherited labels, finds the constraints that remain, and rebuilds a transferable mental model.
- `reasoning-discipline` selects an exact, causal, decision, or factual verification structure according to the task.

The plugin does not create reasoning artifacts, hold a session open, or block file writes. A short answer may remain short. A difficult answer earns more work only when that work can change the conclusion.

## Why there is no reasoning Hook

A candidate `Stop` nudge was rejected. It could prove that another model turn occurred, but not that the conclusion improved; without independent evidence, forced self-correction can preserve an error or replace a correct answer. It would also tax easy tasks and recreate the ceremony this plugin removes.

Hooks remain appropriate for deterministic, externally observable invariants such as preventing an unsafe write or validating a produced artifact. This plugin has no such side effect to guard. Its acceptance cases therefore test outcomes and real Skill loading instead of counting turns or receipts.

## Use

Invoke the host-native Skill name directly when automatic routing is not enough:

- Claude Code: `/first-principles` or `/reasoning-discipline`
- Codex: `$first-principles` or `$reasoning-discipline`

Both Skills lead with the conclusion, distinguish facts from assumptions, and name a useful falsifier or evidence boundary. They do not expose private token-by-token reasoning.

## Migration

This plugin replaces `first-principles-gate` and `reasoning-discipline-guard`. The old `done` or abort lifecycle, business-write barrier, five-stage receipt chain, and workspace state directories are no longer part of the public contract. Existing `.first-principles/` and `.reasoning-discipline/` directories are historical user data and are left untouched.

## Design sources

The implementation independently synthesizes these ideas:

- [`meta-skill` first-principles and adversarial-review methods](https://github.com/wangruofeng/meta-skill/tree/6b5fe52e10289bc974ac42ae0e9ae4b52992d077), used under its MIT license.
- [`fable-skills` handover structure](https://github.com/oliwoodman/fable-skills/tree/e05e35af0f371f55e2ab89c47d8efa144a41630b): one rule, method, checkable standards, output, and honest limits. That audited revision has no license file, so no source text is copied.
- [Step-Back Prompting](https://arxiv.org/abs/2310.06117), which motivates deriving a useful abstraction before solving a detailed instance.
- [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798), which motivates preferring external feedback over an unconditional self-correction loop.
- [Don't Overthink it](https://arxiv.org/abs/2505.17813), which motivates adaptive depth and stopping once the load-bearing condition is checked.

The intended effect is behavioral, not theatrical: better conclusions or better-calibrated uncertainty on representative tasks, without regressing correct control cases.
